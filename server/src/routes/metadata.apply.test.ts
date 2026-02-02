import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import express from "express";
import request from "supertest";

// Mock middlewares
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers["x-mock-user"]) {
      req.user = JSON.parse(req.headers["x-mock-user"] as string);
    }
    next();
  },
}));

vi.mock("../middleware/roleGuard", () => ({
  requireAdmin: (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Admin access required" },
      });
    }
    next();
  },
}));

// Mock services
vi.mock("../services/metadata/metadataSearchService", () => ({
  searchMetadata: vi.fn(),
  getAvailableSources: vi.fn(),
}));

vi.mock("../services/library/bookService", () => ({
  getBookById: vi.fn(),
  updateBook: vi.fn(),
}));

vi.mock("../services/metadata/metadataApplyService", () => ({
  applyMetadata: vi.fn(),
}));

vi.mock("../websocket/event", () => ({
  emitBookUpdated: vi.fn(),
}));

import metadataRouter from "./metadata";
import { getBookById } from "../services/library/bookService";
import { applyMetadata } from "../services/metadata/metadataApplyService";
import { emitBookUpdated } from "../websocket/event";

const app = express();
app.use(express.json());
app.use("/api/v1/metadata", metadataRouter);

describe("Metadata Apply Routes", () => {
  const mockAdminUser = { id: 1, username: "admin", role: "admin" };
  const mockRegularUser = { id: 2, username: "user", role: "user" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    title: "Test Book",
    source: "openlibrary",
    externalId: "OL123",
  };

  it("should return 200 and update book with valid body (Task 3.2)", async () => {
    vi.mocked(getBookById).mockResolvedValue({ id: 123 } as any);
    vi.mocked(applyMetadata).mockResolvedValue({
      bookId: 123,
      fieldsUpdated: ["title"],
      coverDownloaded: false,
    });

    const response = await request(app)
      .post("/api/v1/metadata/123/apply")
      .send(validPayload)
      .set("x-mock-user", JSON.stringify(mockAdminUser));

    expect(response.status).toBe(200);
    expect(response.body.data.fieldsUpdated).toContain("title");
    expect(applyMetadata).toHaveBeenCalledWith(123, { title: "Test Book" });
    expect(emitBookUpdated).toHaveBeenCalledWith(123, expect.objectContaining({
        source: "openlibrary",
        externalId: "OL123"
    }));
  });

  it("should return 400 if title is missing (Task 3.3)", async () => {
    vi.mocked(getBookById).mockResolvedValue({ id: 123 } as any);
    const invalidPayload = { source: "openlibrary", externalId: "OL123" };

    const response = await request(app)
      .post("/api/v1/metadata/123/apply")
      .send(invalidPayload)
      .set("x-mock-user", JSON.stringify(mockAdminUser));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 404 for non-existent bookId (Task 3.4)", async () => {
    vi.mocked(getBookById).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/metadata/999/apply")
      .send(validPayload)
      .set("x-mock-user", JSON.stringify(mockAdminUser));

    expect(response.status).toBe(404);
  });

  it("should return 403 for regular user (Task 3.5)", async () => {
    const response = await request(app)
      .post("/api/v1/metadata/123/apply")
      .send(validPayload)
      .set("x-mock-user", JSON.stringify(mockRegularUser));

    expect(response.status).toBe(403);
  });

  it("should return 401 for unauthenticated request (Task 3.6)", async () => {
    const response = await request(app)
      .post("/api/v1/metadata/123/apply")
      .send(validPayload);

    expect(response.status).toBe(401);
  });

  it("should verify coverUrl handling (Task 3.7 & 3.8)", async () => {
    vi.mocked(getBookById).mockResolvedValue({ id: 123 } as any);
    vi.mocked(applyMetadata).mockResolvedValue({
        bookId: 123,
        fieldsUpdated: ["title", "cover_path"],
        coverDownloaded: true
    });

    const payloadWithCover = { ...validPayload, coverUrl: "http://example.com/img.jpg" };

    const response = await request(app)
      .post("/api/v1/metadata/123/apply")
      .send(payloadWithCover)
      .set("x-mock-user", JSON.stringify(mockAdminUser));

    expect(response.status).toBe(200);
    expect(response.body.data.coverDownloaded).toBe(true);
    expect(applyMetadata).toHaveBeenCalledWith(123, expect.objectContaining({
        coverUrl: "http://example.com/img.jpg"
    }));
  });

  it("should emit book.updated event (Task 3.9)", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: 123 } as any);
      vi.mocked(applyMetadata).mockResolvedValue({
          bookId: 123,
          fieldsUpdated: ["title"],
          coverDownloaded: false
      });

      await request(app)
        .post("/api/v1/metadata/123/apply")
        .send(validPayload)
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(emitBookUpdated).toHaveBeenCalled();
  });
});
