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

vi.mock("../websocket/event", () => ({
  emitBookUpdated: vi.fn(),
}));

import * as dbModule from "../db";
import * as sessionService from "../services/auth/sessionService";
import * as wsEvents from "../websocket/event";

describe("Books Metadata Edit Routes (Story 3.12)", () => {
  let sqlite: Database.Database;
  let testDb: ReturnType<typeof drizzle>;
  let app: express.Application;
  let adminUserId: number;
  let regularUserId: number;
  let testBookId: number;

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
        publication_status TEXT,
        status TEXT DEFAULT 'pending' NOT NULL CHECK(status IN ('pending', 'enriched', 'quarantine')),
        failure_reason TEXT,
        visibility TEXT DEFAULT 'public' NOT NULL CHECK(visibility IN ('public', 'private')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_books_file_path ON books (file_path);
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

    // Create test book
    const testBook = testDb
      .insert(books)
      .values({
        title: "Test Book",
        author: "Original Author",
        description: "Original description",
        genres: JSON.stringify(["Fiction", "Adventure"]),
        series: "Original Series",
        volume: 1,
        isbn: "978-0000000001",
        publication_date: "2020-01-01",
        publisher: "Original Publisher",
        language: "en",
        file_path: "/books/test.epub",
        file_type: "epub",
        content_type: "book",
        visibility: "public",
        status: "enriched",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    testBookId = testBook!.id;

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

    // Reset book to original values
    const now = new Date();
    testDb
      .update(books)
      .set({
        title: "Test Book",
        author: "Original Author",
        description: "Original description",
        genres: JSON.stringify(["Fiction", "Adventure"]),
        series: "Original Series",
        volume: 1,
        isbn: "978-0000000001",
        publication_date: "2020-01-01",
        publisher: "Original Publisher",
        language: "en",
        updated_at: now,
      })
      .where(eq(books.id, testBookId))
      .run();
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

  describe("PATCH /api/v1/books/:id/metadata", () => {
    it("should update title with valid body and return 200 (AC #1, #2)", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "Updated Title" });

      expect(response.status).toBe(200);
      expect(response.body.data.bookId).toBe(testBookId);
      expect(response.body.data.fieldsUpdated).toContain("title");

      // Verify update in database
      const [updated] = testDb
        .select()
        .from(books)
        .where(eq(books.id, testBookId))
        .all();
      expect(updated.title).toBe("Updated Title");
    });

    it("should allow partial update with only title field", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "New Title Only" });

      expect(response.status).toBe(200);
      expect(response.body.data.fieldsUpdated).toEqual(["title"]);

      // Verify other fields unchanged
      const [updated] = testDb
        .select()
        .from(books)
        .where(eq(books.id, testBookId))
        .all();
      expect(updated.title).toBe("New Title Only");
      expect(updated.author).toBe("Original Author");
    });

    it("should update all metadata fields correctly", async () => {
      mockAdminSession();

      const updateData = {
        title: "Full Update Book",
        author: "New Author",
        description: "New description text",
        genres: ["Sci-Fi", "Fantasy", "Action"],
        series: "New Series",
        volume: 5,
        isbn: "978-1234567890",
        publication_date: "2023-06-15",
        publisher: "New Publisher",
        language: "fr",
      };

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.fieldsUpdated.length).toBe(10);

      // Verify all fields in database
      const [updated] = testDb
        .select()
        .from(books)
        .where(eq(books.id, testBookId))
        .all();
      expect(updated.title).toBe("Full Update Book");
      expect(updated.author).toBe("New Author");
      expect(updated.description).toBe("New description text");
      expect(JSON.parse(updated.genres!)).toEqual([
        "Sci-Fi",
        "Fantasy",
        "Action",
      ]);
      expect(updated.series).toBe("New Series");
      expect(updated.volume).toBe(5);
      expect(updated.isbn).toBe("978-1234567890");
      expect(updated.publication_date).toBe("2023-06-15");
      expect(updated.publisher).toBe("New Publisher");
      expect(updated.language).toBe("fr");
    });

    it("should return 400 for empty body", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toBe("No metadata fields provided");
    });

    it("should return 404 for non-existent bookId", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch("/api/v1/books/99999/metadata")
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "Test" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 403 when regular user tries to edit metadata", async () => {
      mockUserSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-user-token")
        .send({ title: "Hacked Title" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=invalid-token")
        .send({ title: "Test" });

      expect(response.status).toBe(401);
    });

    it("should store genres array as JSON string in DB", async () => {
      mockAdminSession();

      const genres = ["Horror", "Thriller", "Mystery"];
      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ genres });

      expect(response.status).toBe(200);

      // Verify genres stored as JSON string
      const [updated] = testDb
        .select()
        .from(books)
        .where(eq(books.id, testBookId))
        .all();
      expect(typeof updated.genres).toBe("string");
      expect(JSON.parse(updated.genres!)).toEqual(genres);
    });

    it("should emit book.updated WebSocket event", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "WebSocket Test" });

      expect(response.status).toBe(200);
      expect(wsEvents.emitBookUpdated).toHaveBeenCalledWith(testBookId, {
        fieldsUpdated: ["title"],
      });
    });

    it("should return 400 for invalid book ID format", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch("/api/v1/books/invalid/metadata")
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "Test" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should allow setting fields to null", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({
          author: null,
          description: null,
          series: null,
        });

      expect(response.status).toBe(200);

      const [updated] = testDb
        .select()
        .from(books)
        .where(eq(books.id, testBookId))
        .all();
      expect(updated.author).toBeNull();
      expect(updated.description).toBeNull();
      expect(updated.series).toBeNull();
    });

    it("should validate volume as positive integer", async () => {
      mockAdminSession();

      // Negative volume should fail validation
      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ volume: -1 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject empty title string", async () => {
      mockAdminSession();

      const response = await request(app)
        .patch(`/api/v1/books/${testBookId}/metadata`)
        .set("Cookie", "session=valid-admin-token")
        .send({ title: "" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
