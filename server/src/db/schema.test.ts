import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { users, sessions, books } from "./schema";
import type {
  User,
  NewUser,
  UserRole,
  Session,
  NewSession,
  Book,
  NewBook,
  Visibility,
  FileType,
  ContentType,
  BookStatus,
} from "./schema";

describe("User Schema (Story 1.2)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    // Use in-memory database for tests
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema: { users, sessions } });

    // Create table with CHECK constraint
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

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_token ON sessions (token);
      CREATE INDEX idx_sessions_user_id ON sessions (user_id);
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  describe("AC #1: Users table columns", () => {
    it("should have all required columns: id, username, password_hash, role, created_at, updated_at", () => {
      const tableInfo = sqlite.pragma("table_info(users)") as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("username");
      expect(columnNames).toContain("password_hash");
      expect(columnNames).toContain("role");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    it("should insert user with all fields populated", () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: "testuser_ac1",
          password_hash: "hashed_password",
          role: "user",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result).toBeDefined();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.username).toBe("testuser_ac1");
      expect(result!.password_hash).toBe("hashed_password");
      expect(result!.role).toBe("user");
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });
  });

  describe("AC #2: Role constraint", () => {
    it('should accept "admin" role', () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: "admin_user",
          password_hash: "hash",
          role: "admin",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.role).toBe("admin");
    });

    it('should accept "user" role', () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: "normal_user",
          password_hash: "hash",
          role: "user",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.role).toBe("user");
    });

    it("should reject invalid role values", () => {
      const now = new Date();
      expect(() => {
        db.insert(users)
          .values({
            username: "invalid_role_user",
            password_hash: "hash",
            role: "superuser" as any, // Testing runtime constraint with invalid role
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe("AC #3: Unique username constraint", () => {
    it("should reject duplicate usernames", () => {
      const now = new Date();
      const username = "duplicate_test_user";

      // First insert should succeed
      db.insert(users)
        .values({
          username,
          password_hash: "hash1",
          role: "user",
          created_at: now,
          updated_at: now,
        })
        .run();

      // Second insert with same username should fail
      expect(() => {
        db.insert(users)
          .values({
            username,
            password_hash: "hash2",
            role: "user",
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe("AC #4: TypeScript type inference", () => {
    it("should export User type with correct shape", () => {
      const user: User = {
        id: 1,
        username: "test",
        password_hash: "hash",
        role: "user",
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.password_hash).toBeDefined();
      expect(user.role).toBeDefined();
      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
    });

    it("should export NewUser type for inserts", () => {
      const newUser: NewUser = {
        username: "new_user",
        password_hash: "hash",
        role: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(newUser.username).toBeDefined();
      // id should be optional for NewUser
      expect(newUser.id).toBeUndefined();
    });

    it("should export UserRole type", () => {
      const adminRole: UserRole = "admin";
      const userRole: UserRole = "user";

      expect(adminRole).toBe("admin");
      expect(userRole).toBe("user");
    });
  });

  describe("AC #5: Migration system", () => {
    it("should have idx_users_username index", () => {
      const indexes = sqlite.pragma("index_list(users)") as Array<{
        name: string;
        unique: number;
      }>;

      const usernameIndex = indexes.find(
        (idx) => idx.name === "idx_users_username",
      );
      expect(usernameIndex).toBeDefined();
      expect(usernameIndex!.unique).toBe(1);
    });
  });
});

describe("Sessions Schema (Story 1.4)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let testUserId: number;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema: { users, sessions } });

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

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_token ON sessions (token);
      CREATE INDEX idx_sessions_user_id ON sessions (user_id);
    `);

    // Create test user for session tests
    const now = new Date();
    const result = db
      .insert(users)
      .values({
        username: "session_test_user",
        password_hash: "hashed_password",
        role: "user",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    testUserId = result!.id;
  });

  afterAll(() => {
    sqlite.close();
  });

  describe("AC #2: Sessions table columns (Story 1.4)", () => {
    it("should have all required columns: id, user_id, token, expires_at, created_at", () => {
      const tableInfo = sqlite.pragma("table_info(sessions)") as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("user_id");
      expect(columnNames).toContain("token");
      expect(columnNames).toContain("expires_at");
      expect(columnNames).toContain("created_at");
    });

    it("should insert session with all fields populated", () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = db
        .insert(sessions)
        .values({
          user_id: testUserId,
          token: "test_token_abc123",
          expires_at: expiresAt,
          created_at: now,
        })
        .returning()
        .get();

      expect(result).toBeDefined();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.user_id).toBe(testUserId);
      expect(result!.token).toBe("test_token_abc123");
      expect(result!.expires_at).toBeInstanceOf(Date);
      expect(result!.created_at).toBeInstanceOf(Date);
    });
  });

  describe("Session token uniqueness", () => {
    it("should reject duplicate tokens", () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const token = "unique_token_test";

      // First insert should succeed
      db.insert(sessions)
        .values({
          user_id: testUserId,
          token,
          expires_at: expiresAt,
          created_at: now,
        })
        .run();

      // Second insert with same token should fail
      expect(() => {
        db.insert(sessions)
          .values({
            user_id: testUserId,
            token,
            expires_at: expiresAt,
            created_at: now,
          })
          .run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe("Session indexes", () => {
    it("should have idx_sessions_token index for fast lookups", () => {
      const indexes = sqlite.pragma("index_list(sessions)") as Array<{
        name: string;
        unique: number;
      }>;

      const tokenIndex = indexes.find(
        (idx) => idx.name === "idx_sessions_token",
      );
      expect(tokenIndex).toBeDefined();
    });

    it("should have idx_sessions_user_id index", () => {
      const indexes = sqlite.pragma("index_list(sessions)") as Array<{
        name: string;
        unique: number;
      }>;

      const userIdIndex = indexes.find(
        (idx) => idx.name === "idx_sessions_user_id",
      );
      expect(userIdIndex).toBeDefined();
    });
  });

  describe("TypeScript type inference for Session", () => {
    it("should export Session type with correct shape", () => {
      const session: Session = {
        id: 1,
        user_id: 1,
        token: "abc123",
        expires_at: new Date(),
        created_at: new Date(),
      };

      expect(session.id).toBeDefined();
      expect(session.user_id).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.expires_at).toBeDefined();
      expect(session.created_at).toBeDefined();
    });

    it("should export NewSession type for inserts", () => {
      const newSession: NewSession = {
        user_id: 1,
        token: "new_token",
        expires_at: new Date(),
        created_at: new Date(),
      };

      expect(newSession.user_id).toBeDefined();
      expect(newSession.token).toBeDefined();
      // id should be optional for NewSession
      expect(newSession.id).toBeUndefined();
    });
  });
});

describe("Books Schema (Story 1.7)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema: { users, sessions, books } });

    sqlite.exec(`
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
        publisher TEXT,
        language TEXT,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL CHECK(file_type IN ('epub', 'cbz', 'cbr')),
        content_type TEXT NOT NULL CHECK(content_type IN ('book', 'manga')),
        cover_path TEXT,
        publication_status TEXT,
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
  });

  afterAll(() => {
    sqlite.close();
  });

  describe("AC #1: Visibility column exists with constraint", () => {
    it("should have visibility column", () => {
      const tableInfo = sqlite.pragma("table_info(books)") as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const visibilityCol = tableInfo.find((col) => col.name === "visibility");
      expect(visibilityCol).toBeDefined();
      expect(visibilityCol!.type).toBe("TEXT");
      expect(visibilityCol!.notnull).toBe(1);
    });

    it('should accept "public" visibility', () => {
      const now = new Date();
      const result = db
        .insert(books)
        .values({
          title: "Public Book",
          file_path: "/books/public-book.epub",
          file_type: "epub",
          content_type: "book",
          visibility: "public",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.visibility).toBe("public");
    });

    it('should accept "private" visibility', () => {
      const now = new Date();
      const result = db
        .insert(books)
        .values({
          title: "Private Book",
          file_path: "/books/private-book.epub",
          file_type: "epub",
          content_type: "book",
          visibility: "private",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.visibility).toBe("private");
    });

    it("should reject invalid visibility values", () => {
      const now = new Date();
      expect(() => {
        db.insert(books)
          .values({
            title: "Invalid Visibility Book",
            file_path: "/books/invalid-vis.epub",
            file_type: "epub",
            content_type: "book",
            visibility: "secret" as any,
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe("AC #4: Default visibility is public", () => {
    it("should default visibility to public when not specified", () => {
      const now = new Date();
      const result = db
        .insert(books)
        .values({
          title: "Default Visibility Book",
          file_path: "/books/default-vis.epub",
          file_type: "epub",
          content_type: "book",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.visibility).toBe("public");
    });
  });

  describe("Books table all columns", () => {
    it("should have all required columns", () => {
      const tableInfo = sqlite.pragma("table_info(books)") as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("author");
      expect(columnNames).toContain("file_path");
      expect(columnNames).toContain("file_type");
      expect(columnNames).toContain("content_type");
      expect(columnNames).toContain("cover_path");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("visibility");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    it("should insert book with all fields populated", () => {
      const now = new Date();
      const result = db
        .insert(books)
        .values({
          title: "Complete Book",
          author: "Test Author",
          file_path: "/books/complete-book.cbz",
          file_type: "cbz",
          content_type: "manga",
          cover_path: "/covers/complete.jpg",
          status: "enriched",
          visibility: "public",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result).toBeDefined();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.title).toBe("Complete Book");
      expect(result!.author).toBe("Test Author");
      expect(result!.file_path).toBe("/books/complete-book.cbz");
      expect(result!.file_type).toBe("cbz");
      expect(result!.content_type).toBe("manga");
      expect(result!.cover_path).toBe("/covers/complete.jpg");
      expect(result!.status).toBe("enriched");
      expect(result!.visibility).toBe("public");
    });
  });

  describe("File type constraint", () => {
    it("should accept epub, cbz, cbr file types", () => {
      const now = new Date();

      const epub = db
        .insert(books)
        .values({
          title: "Epub Book",
          file_path: "/books/test-epub.epub",
          file_type: "epub",
          content_type: "book",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();
      expect(epub!.file_type).toBe("epub");

      const cbz = db
        .insert(books)
        .values({
          title: "CBZ Manga",
          file_path: "/books/test-cbz.cbz",
          file_type: "cbz",
          content_type: "manga",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();
      expect(cbz!.file_type).toBe("cbz");

      const cbr = db
        .insert(books)
        .values({
          title: "CBR Manga",
          file_path: "/books/test-cbr.cbr",
          file_type: "cbr",
          content_type: "manga",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();
      expect(cbr!.file_type).toBe("cbr");
    });

    it("should reject invalid file types", () => {
      const now = new Date();
      expect(() => {
        db.insert(books)
          .values({
            title: "Invalid File Type",
            file_path: "/books/invalid.pdf",
            file_type: "pdf" as any,
            content_type: "book",
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe("Content type constraint", () => {
    it("should accept book and manga content types", () => {
      const now = new Date();

      const book = db
        .insert(books)
        .values({
          title: "Book Type",
          file_path: "/books/book-type.epub",
          file_type: "epub",
          content_type: "book",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();
      expect(book!.content_type).toBe("book");

      const manga = db
        .insert(books)
        .values({
          title: "Manga Type",
          file_path: "/books/manga-type.cbz",
          file_type: "cbz",
          content_type: "manga",
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();
      expect(manga!.content_type).toBe("manga");
    });

    it("should reject invalid content types", () => {
      const now = new Date();
      expect(() => {
        db.insert(books)
          .values({
            title: "Invalid Content Type",
            file_path: "/books/invalid-content.epub",
            file_type: "epub",
            content_type: "comic" as any,
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe("Unique file_path constraint", () => {
    it("should reject duplicate file paths", () => {
      const now = new Date();
      const filePath = "/books/duplicate-path.epub";

      db.insert(books)
        .values({
          title: "First Book",
          file_path: filePath,
          file_type: "epub",
          content_type: "book",
          created_at: now,
          updated_at: now,
        })
        .run();

      expect(() => {
        db.insert(books)
          .values({
            title: "Duplicate Book",
            file_path: filePath,
            file_type: "epub",
            content_type: "book",
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe("Books indexes", () => {
    it("should have idx_books_file_path unique index", () => {
      const indexes = sqlite.pragma("index_list(books)") as Array<{
        name: string;
        unique: number;
      }>;

      const filePathIndex = indexes.find(
        (idx) => idx.name === "idx_books_file_path",
      );
      expect(filePathIndex).toBeDefined();
      expect(filePathIndex!.unique).toBe(1);
    });

    it("should have idx_books_visibility index", () => {
      const indexes = sqlite.pragma("index_list(books)") as Array<{
        name: string;
        unique: number;
      }>;

      const visibilityIndex = indexes.find(
        (idx) => idx.name === "idx_books_visibility",
      );
      expect(visibilityIndex).toBeDefined();
    });
  });

  describe("TypeScript type inference for Book", () => {
    it("should export Book type with correct shape", () => {
      const book: Book = {
        id: 1,
        title: "Test Book",
        author: "Author",
        description: "A test book",
        genres: "Fiction",
        series: "Test Series",
        volume: 1,
        isbn: "123-456-789",
        publication_date: "2024-01-01",
        publisher: null,
        language: null,
        file_path: "/path/to/book.epub",
        file_type: "epub",
        content_type: "book",
        cover_path: "/covers/test.jpg",
        status: "pending",
        failure_reason: null,
        visibility: "public",
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(book.id).toBeDefined();
      expect(book.title).toBeDefined();
      expect(book.visibility).toBeDefined();
    });

    it("should export NewBook type for inserts", () => {
      const newBook: NewBook = {
        title: "New Book",
        file_path: "/path/new.epub",
        file_type: "epub",
        content_type: "book",
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(newBook.title).toBeDefined();
      expect(newBook.id).toBeUndefined();
    });

    it("should export Visibility type", () => {
      const publicVis: Visibility = "public";
      const privateVis: Visibility = "private";

      expect(publicVis).toBe("public");
      expect(privateVis).toBe("private");
    });

    it("should export FileType type", () => {
      const epub: FileType = "epub";
      const cbz: FileType = "cbz";
      const cbr: FileType = "cbr";

      expect(epub).toBe("epub");
      expect(cbz).toBe("cbz");
      expect(cbr).toBe("cbr");
    });

    it("should export ContentType type", () => {
      const book: ContentType = "book";
      const manga: ContentType = "manga";

      expect(book).toBe("book");
      expect(manga).toBe("manga");
    });

    it("should export BookStatus type", () => {
      const pending: BookStatus = "pending";
      const enriched: BookStatus = "enriched";
      const quarantine: BookStatus = "quarantine";

      expect(pending).toBe("pending");
      expect(enriched).toBe("enriched");
      expect(quarantine).toBe("quarantine");
    });
  });
});
