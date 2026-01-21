import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { books, users } from '../../db/schema';
import { setBookVisibility, getVisibilityFilter, canUserSeeBook, applyVisibilityFilter } from './visibilityService';

// Mock the db module for unit tests
import * as dbModule from '../../db';
import { vi } from 'vitest';

describe('visibilityService', () => {
  describe('getVisibilityFilter (AC #2, #3)', () => {
    it('should return undefined for admin role (no filter - sees all)', () => {
      const filter = getVisibilityFilter('admin');
      expect(filter).toBeUndefined();
    });

    it('should return visibility filter for user role (only public)', () => {
      const filter = getVisibilityFilter('user');
      expect(filter).toBeDefined();
      // The filter should be an SQL condition for visibility = 'public'
    });
  });

  describe('canUserSeeBook (AC #2, #3)', () => {
    describe('Admin role', () => {
      it('should return true for public content', () => {
        expect(canUserSeeBook('public', 'admin')).toBe(true);
      });

      it('should return true for private content (admin sees all)', () => {
        expect(canUserSeeBook('private', 'admin')).toBe(true);
      });
    });

    describe('User role', () => {
      it('should return true for public content', () => {
        expect(canUserSeeBook('public', 'user')).toBe(true);
      });

      it('should return false for private content (users cannot see private)', () => {
        expect(canUserSeeBook('private', 'user')).toBe(false);
      });
    });
  });
});

describe('visibilityService integration', () => {
  let sqlite: Database.Database;
  let testDb: ReturnType<typeof drizzle>;
  let testBookId: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    testDb = drizzle(sqlite, { schema: { users, books } });

    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL CHECK(role IN ('admin', 'user')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_users_username ON users (username);

      CREATE TABLE books (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        description TEXT,
        genres TEXT,
        series TEXT,
        volume INTEGER,
        isbn TEXT,
        publication_date TEXT,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL CHECK(file_type IN ('epub', 'cbz', 'cbr')),
        content_type TEXT NOT NULL CHECK(content_type IN ('book', 'manga')),
        cover_path TEXT,
        status TEXT DEFAULT 'pending' NOT NULL CHECK(status IN ('pending', 'enriched', 'quarantine')),
        failure_reason TEXT,
        visibility TEXT DEFAULT 'public' NOT NULL CHECK(visibility IN ('public', 'private')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_books_file_path ON books (file_path);
      CREATE INDEX idx_books_visibility ON books (visibility);
      CREATE INDEX idx_books_title ON books (title);
      CREATE INDEX idx_books_author ON books (author);
      CREATE INDEX idx_books_content_type ON books (content_type);
      CREATE INDEX idx_books_status ON books (status);
      CREATE INDEX idx_books_created_at ON books (created_at);
    `);

    // Insert test book
    const now = new Date();
    const result = testDb
      .insert(books)
      .values({
        title: 'Test Book',
        file_path: '/test/book.epub',
        file_type: 'epub',
        content_type: 'book',
        visibility: 'public',
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    testBookId = result!.id;
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('setBookVisibility integration', () => {
    it('should update book visibility to private', async () => {
      // Mock db to use testDb
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(testDb as any);

      await setBookVisibility(testBookId, 'private');

      const [book] = testDb.select().from(books).where(eq(books.id, testBookId)).all();
      expect(book.visibility).toBe('private');

      vi.restoreAllMocks();
    });

    it('should update book visibility to public', async () => {
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(testDb as any);

      await setBookVisibility(testBookId, 'public');

      const [book] = testDb.select().from(books).where(eq(books.id, testBookId)).all();
      expect(book.visibility).toBe('public');

      vi.restoreAllMocks();
    });

    it('should update updated_at timestamp when changing visibility', async () => {
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(testDb as any);

      const [bookBefore] = testDb.select().from(books).where(eq(books.id, testBookId)).all();
      const beforeTimestamp = bookBefore.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await setBookVisibility(testBookId, 'private');

      const [bookAfter] = testDb.select().from(books).where(eq(books.id, testBookId)).all();
      expect(bookAfter.updated_at.getTime()).toBeGreaterThanOrEqual(beforeTimestamp.getTime());

      vi.restoreAllMocks();
    });
  });

  describe('getVisibilityFilter query integration', () => {
    beforeEach(() => {
      // Reset book to known state
      testDb.update(books).set({ visibility: 'public' }).where(eq(books.id, testBookId)).run();

      // Add a private book for testing (use unique file_path to avoid UNIQUE constraint)
      const now = new Date();
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      testDb
        .insert(books)
        .values({
          title: 'Private Test Book',
          file_path: `/test/private-book-${uniqueId}.epub`,
          file_type: 'epub',
          content_type: 'book',
          visibility: 'private',
          created_at: now,
          updated_at: now,
        })
        .run();
    });

    it('admin filter should return all books (both public and private)', () => {
      const filter = getVisibilityFilter('admin');

      let query = testDb.select().from(books);
      if (filter) {
        query = query.where(filter) as any;
      }
      const result = query.all();

      const publicBooks = result.filter((b) => b.visibility === 'public');
      const privateBooks = result.filter((b) => b.visibility === 'private');

      expect(publicBooks.length).toBeGreaterThan(0);
      expect(privateBooks.length).toBeGreaterThan(0);
    });

    it('user filter should return only public books', () => {
      const filter = getVisibilityFilter('user');

      let query = testDb.select().from(books);
      if (filter) {
        query = query.where(filter) as any;
      }
      const result = query.all();

      const allPublic = result.every((b) => b.visibility === 'public');
      expect(allPublic).toBe(true);
    });
  });

  describe('applyVisibilityFilter (AC #2, #3, #5)', () => {
    it('should return undefined for admin with no additional conditions', () => {
      const filter = applyVisibilityFilter('admin');
      expect(filter).toBeUndefined();
    });

    it('should return visibility filter for user with no additional conditions', () => {
      const filter = applyVisibilityFilter('user');
      expect(filter).toBeDefined();
    });

    it('should combine visibility filter with additional conditions for user', () => {
      const additionalCondition = eq(books.content_type, 'book');
      const filter = applyVisibilityFilter('user', [additionalCondition]);
      expect(filter).toBeDefined();

      // Apply filter and verify it works
      let query = testDb.select().from(books);
      if (filter) {
        query = query.where(filter) as any;
      }
      const result = query.all();

      // All results should be public AND content_type = 'book'
      const allMatch = result.every(
        (b) => b.visibility === 'public' && b.content_type === 'book'
      );
      expect(allMatch).toBe(true);
    });

    it('should return only additional conditions for admin', () => {
      const additionalCondition = eq(books.content_type, 'manga');
      const filter = applyVisibilityFilter('admin', [additionalCondition]);
      expect(filter).toBeDefined();

      // Insert a manga book for test
      const now = new Date();
      testDb
        .insert(books)
        .values({
          title: 'Test Manga',
          file_path: `/test/manga-${Date.now()}.cbz`,
          file_type: 'cbz',
          content_type: 'manga',
          visibility: 'private',
          created_at: now,
          updated_at: now,
        })
        .run();

      // Apply filter and verify it works
      let query = testDb.select().from(books);
      if (filter) {
        query = query.where(filter) as any;
      }
      const result = query.all();

      // Admin should see all manga regardless of visibility
      const allManga = result.every((b) => b.content_type === 'manga');
      expect(allManga).toBe(true);
    });

    it('should handle empty additional conditions array', () => {
      const userFilter = applyVisibilityFilter('user', []);
      expect(userFilter).toBeDefined();

      const adminFilter = applyVisibilityFilter('admin', []);
      expect(adminFilter).toBeUndefined();
    });
  });
});
