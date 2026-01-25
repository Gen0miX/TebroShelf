import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { json } from "express";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { users, books, sessions } from "../db/schema";
import booksRouter from "./books";

// Mock dependencies
vi.mock("../db", () => ({
  db: null as any,
}));

vi.mock("../services/auth/sessionService", () => ({
  validateSession: vi.fn(),
  isValidTokenFormat: vi.fn().mockReturnValue(true),
  isSlidingExpirationEnabled: vi.fn().mockReturnValue(false),
  refreshSession: vi.fn().mockResolvedValue(undefined),
}));

import * as dbModule from "../db";
import * as sessionService from "../services/auth/sessionService";

describe("Books Routes (Story 1.7)", () => {
  let sqlite: Database.Database;
  let testDb: ReturnType<typeof drizzle>;
  let app: express.Application;
  let adminUserId: number;
  let regularUserId: number;
  let publicBookId: number;
  let privateBookId: number;

  beforeAll(() => {
    // Setup in-memory database
    sqlite = new Database(":memory:");
    testDb = drizzle(sqlite, { schema: { users, books, sessions } });

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

    // Create test users
    const now = new Date();

    const adminResult = testDb
      .insert(users)
      .values({
        username: "admin",
        password_hash: "hash",
        role: "admin",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    adminUserId = adminResult!.id;

    const userResult = testDb
      .insert(users)
      .values({
        username: "user",
        password_hash: "hash",
        role: "user",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    regularUserId = userResult!.id;

    // Create test books
    const publicBook = testDb
      .insert(books)
      .values({
        title: "Public Book",
        author: "Author A",
        file_path: "/books/public.epub",
        file_type: "epub",
        content_type: "book",
        visibility: "public",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    publicBookId = publicBook!.id;

    const privateBook = testDb
      .insert(books)
      .values({
        title: "Private Book",
        author: "Author B",
        file_path: "/books/private.epub",
        file_type: "epub",
        content_type: "book",
        visibility: "private",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    privateBookId = privateBook!.id;

    // Mock db to use testDb
    vi.spyOn(dbModule, "db", "get").mockReturnValue(testDb as any);

    // Setup Express app
    app = express();
    app.use(json());
    app.use(cookieParser());
    app.use("/api/v1/books", booksRouter);
  });

  afterAll(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock for db
    vi.spyOn(dbModule, "db", "get").mockReturnValue(testDb as any);
  });

  const mockAdminSession = () => {
    vi.mocked(sessionService.validateSession).mockResolvedValue({
      session: {
        id: 1,
        user_id: adminUserId,
        token: "fake-token",
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      },
      user: {
        id: adminUserId,
        username: "admin",
        role: "admin",
      },
    });
  };

  const mockUserSession = () => {
    vi.mocked(sessionService.validateSession).mockResolvedValue({
      session: {
        id: 2,
        user_id: regularUserId,
        token: "fake-token",
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      },
      user: {
        id: regularUserId,
        username: "user",
        role: "user",
      },
    });
  };

  describe("PATCH /api/v1/books/:id/visibility (AC #1)", () => {
    it("should allow admin to set visibility to private", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${publicBookId}/visibility`)
        .set("Cookie", "session=valid-admin-token")
        .send({ visibility: "private" });

      expect(response.status).toBe(200);
      expect(response.body.data.visibility).toBe("private");

      // Reset to public for other tests
      testDb
        .update(books)
        .set({ visibility: "public" })
        .where(eq(books.id, publicBookId))
        .run();
    });

    it("should allow admin to set visibility to public", async () => {
      mockAdminSession();

      // First set to private
      testDb
        .update(books)
        .set({ visibility: "private" })
        .where(eq(books.id, publicBookId))
        .run();

      const response = await request(app)
        .patch(`/api/v1/books/${publicBookId}/visibility`)
        .set("Cookie", "session=valid-admin-token")
        .send({ visibility: "public" });

      expect(response.status).toBe(200);
      expect(response.body.data.visibility).toBe("public");
    });

    it("should return 400 for invalid visibility value", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${publicBookId}/visibility`)
        .set("Cookie", "session=valid-admin-token")
        .send({ visibility: "secret" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 for non-existent book", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch("/api/v1/books/99999/visibility")
        .set("Cookie", "session=valid-admin-token")
        .send({ visibility: "private" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 400 for invalid book ID", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch("/api/v1/books/invalid/visibility")
        .set("Cookie", "session=valid-admin-token")
        .send({ visibility: "private" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 403 when regular user tries to set visibility", async () => {
      mockUserSession();

      const response = await request(app)
        .patch(`/api/v1/books/${publicBookId}/visibility`)
        .set("Cookie", "session=valid-user-token")
        .send({ visibility: "private" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/v1/books/${publicBookId}/visibility`)
        .set("Cookie", "session=invalid-token")
        .send({ visibility: "private" });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/books (AC #2, #3, #5)", () => {
    it("should return all books for admin including visibility field", async () => {
      mockAdminSession();

      const response = await request(app)
        .get("/api/v1/books")
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);

      // Admin should see both public and private books
      const titles = response.body.data.map((b: any) => b.title);
      expect(titles).toContain("Public Book");
      expect(titles).toContain("Private Book");

      // Admin response should include visibility field
      const book = response.body.data.find(
        (b: any) => b.title === "Private Book",
      );
      expect(book.visibility).toBe("private");
      expect(book.isPrivate).toBe(true);
    });

    it("should return only public books for regular user (AC #2)", async () => {
      mockUserSession();

      const response = await request(app)
        .get("/api/v1/books")
        .set("Cookie", "session=valid-user-token");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);

      // User should only see public books
      const titles = response.body.data.map((b: any) => b.title);
      expect(titles).toContain("Public Book");
      expect(titles).not.toContain("Private Book");
    });

    it("should not include visibility field in user response", async () => {
      mockUserSession();

      const response = await request(app)
        .get("/api/v1/books")
        .set("Cookie", "session=valid-user-token");

      expect(response.status).toBe(200);

      // User response should not include visibility field
      const book = response.body.data[0];
      expect(book.visibility).toBeUndefined();
      expect(book.isPrivate).toBeUndefined();
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .get("/api/v1/books")
        .set("Cookie", "session=invalid-token");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/books/:id", () => {
    it("should return book for admin regardless of visibility", async () => {
      mockAdminSession();

      const response = await request(app)
        .get(`/api/v1/books/${privateBookId}`)
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe("Private Book");
      expect(response.body.data.visibility).toBe("private");
    });

    it("should return public book for regular user", async () => {
      mockUserSession();

      const response = await request(app)
        .get(`/api/v1/books/${publicBookId}`)
        .set("Cookie", "session=valid-user-token");

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe("Public Book");
    });

    it("should return 404 for private book when accessed by regular user (AC #2)", async () => {
      mockUserSession();

      const response = await request(app)
        .get(`/api/v1/books/${privateBookId}`)
        .set("Cookie", "session=valid-user-token");

      // Returns 404 to not reveal existence of private content
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 404 for non-existent book", async () => {
      mockAdminSession();

      const response = await request(app)
        .get("/api/v1/books/99999")
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(404);
    });
  });
});

describe("Books visibility default (AC #4)", () => {
  let sqlite: Database.Database;
  let testDb: ReturnType<typeof drizzle>;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    testDb = drizzle(sqlite, { schema: { books } });

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
        status TEXT DEFAULT 'pending' NOT NULL CHECK(status IN ('pending', 'enriched', 'quarantine')),
        failure_reason TEXT,
        visibility TEXT DEFAULT 'public' NOT NULL CHECK(visibility IN ('public', 'private')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("should default visibility to public when not specified", () => {
    const now = new Date();
    const result = testDb
      .insert(books)
      .values({
        title: "New Book",
        file_path: "/books/new.epub",
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
