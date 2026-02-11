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
import path from "path";
import fs from "fs";

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

describe("Books Cover Upload Routes (Story 3.12)", () => {
  let sqlite: Database.Database;
  let testDb: ReturnType<typeof drizzle>;
  let app: express.Application;
  let adminUserId: number;
  let regularUserId: number;
  let testBookId: number;
  let testBookWithCoverId: number;
  const testCoversDir = path.join(process.cwd(), "data", "covers");
  const testCoverPath = path.join(testCoversDir, "test-cover.jpg");

  beforeAll(() => {
    // Ensure test covers directory exists
    if (!fs.existsSync(testCoversDir)) {
      fs.mkdirSync(testCoversDir, { recursive: true });
    }

    // Create a test cover file
    fs.writeFileSync(testCoverPath, Buffer.alloc(1000, 0xff));

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

    // Create test book without cover
    const testBook = testDb
      .insert(books)
      .values({
        title: "Test Book No Cover",
        file_path: "/books/test-no-cover.epub",
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

    // Create test book with cover
    const testBookWithCover = testDb
      .insert(books)
      .values({
        title: "Test Book With Cover",
        file_path: "/books/test-with-cover.epub",
        file_type: "epub",
        content_type: "book",
        cover_path: "covers/test-cover.jpg",
        visibility: "public",
        status: "enriched",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    testBookWithCoverId = testBookWithCover!.id;

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

    // Clean up test cover file
    if (fs.existsSync(testCoverPath)) {
      fs.unlinkSync(testCoverPath);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe("POST /api/v1/books/:id/cover", () => {
    it("should return 400 when no file is provided", async () => {
      mockAdminSession();

      const response = await request(app)
        .post(`/api/v1/books/${testBookId}/cover`)
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toBe("No cover image provided");
    });

    it("should return 404 for non-existent book", async () => {
      mockAdminSession();

      // Create a small valid JPEG buffer
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);

      const response = await request(app)
        .post("/api/v1/books/99999/cover")
        .set("Cookie", "session=valid-admin-token")
        .attach("cover", jpegBuffer, "test.jpg");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 403 when non-admin tries to upload cover", async () => {
      mockUserSession();

      const response = await request(app)
        .post(`/api/v1/books/${testBookId}/cover`)
        .set("Cookie", "session=valid-user-token");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/v1/books/${testBookId}/cover`)
        .set("Cookie", "session=invalid-token");

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid book ID format", async () => {
      mockAdminSession();

      const response = await request(app)
        .post("/api/v1/books/invalid/cover")
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/books/:id/cover", () => {
    it("should serve cover image for book with cover", async () => {
      mockAdminSession();

      const response = await request(app)
        .get(`/api/v1/books/${testBookWithCoverId}/cover`)
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/jpeg");
      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    });

    it("should return 404 for book without cover", async () => {
      mockAdminSession();

      const response = await request(app)
        .get(`/api/v1/books/${testBookId}/cover`)
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe("Cover not found");
    });

    it("should return 404 for non-existent book", async () => {
      mockAdminSession();

      const response = await request(app)
        .get("/api/v1/books/99999/cover")
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should allow regular user to access cover", async () => {
      mockUserSession();

      const response = await request(app)
        .get(`/api/v1/books/${testBookWithCoverId}/cover`)
        .set("Cookie", "session=valid-user-token");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/jpeg");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/v1/books/${testBookWithCoverId}/cover`)
        .set("Cookie", "session=invalid-token");

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid book ID format", async () => {
      mockAdminSession();

      const response = await request(app)
        .get("/api/v1/books/invalid/cover")
        .set("Cookie", "session=valid-admin-token");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});

describe("WebSocket event emitBookUpdated (Story 3.12)", () => {
  it("should export emitBookUpdated function", async () => {
    // Restore the actual module to test its exports
    vi.unmock("../websocket/event");
    const { emitBookUpdated } = await import("../websocket/event");
    expect(typeof emitBookUpdated).toBe("function");
  });
});
