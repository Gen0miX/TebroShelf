import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import express from "express";
import request from "supertest";

// Mock the bookService
const mockGetBookById = vi.fn();
const mockUpdateBook = vi.fn();
vi.mock("../services/library/bookService", () => ({
  getBookById: (...args: unknown[]) => mockGetBookById(...args),
  updateBook: (...args: unknown[]) => mockUpdateBook(...args),
}));

// Mock the WebSocket event emitter
const mockEmitBookUpdated = vi.fn();
vi.mock("../websocket/event", () => ({
  emitBookUpdated: (...args: unknown[]) => mockEmitBookUpdated(...args),
}));

// Mock the logger
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the db module (needed for other routes in the file)
vi.mock("../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: vi.fn(),
    catch: vi.fn(),
  };
  return { db: mockDb };
});

// Mock requireAuth middleware
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers["x-mock-user"]) {
      req.user = JSON.parse(req.headers["x-mock-user"] as string);
    }
    next();
  },
}));

// Mock requireAdmin middleware
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

import quarantineRouter from "./quarantine";

const app = express();
app.use(express.json());
app.use("/api/v1/quarantine", quarantineRouter);

describe("Quarantine Approve Routes", () => {
  const mockAdminUser = { id: 1, username: "admin", role: "admin" };
  const mockRegularUser = { id: 2, username: "user", role: "user" };

  const mockQuarantinedBook = {
    id: 1,
    title: "Test Book",
    author: "Test Author",
    description: "Test description",
    genres: '["fiction"]',
    series: null,
    volume: null,
    isbn: null,
    publication_date: null,
    publisher: null,
    language: "en",
    file_path: "/path/to/book.epub",
    file_type: "epub",
    content_type: "book",
    cover_path: "/covers/book.jpg",
    status: "quarantine",
    failure_reason: "Enrichment failed: all sources unavailable",
    visibility: "public",
    created_at: new Date("2024-01-01T10:00:00Z"),
    updated_at: new Date("2024-01-01T10:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/quarantine/:id/approve", () => {
    it("should return 200 and status changes to enriched for valid quarantined book (AC #1, #2)", async () => {
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
        failure_reason: null,
        updated_at: new Date(),
      });

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("enriched");
      expect(mockUpdateBook).toHaveBeenCalledWith(1, {
        status: "enriched",
        failure_reason: null,
      });
    });

    it("should clear failure_reason after approval (AC #1)", async () => {
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
        failure_reason: null,
      });

      await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(mockUpdateBook).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ failure_reason: null })
      );
    });

    it("should emit book.updated WebSocket event with correct payload (AC #4)", async () => {
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
        failure_reason: null,
      });

      await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(mockEmitBookUpdated).toHaveBeenCalledWith(1, {
        status: "enriched",
        previousStatus: "quarantine",
      });
    });

    it("should return 404 for non-existent bookId (AC #8)", async () => {
      mockGetBookById.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/v1/quarantine/999/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toBe("Book not found");
    });

    it("should return 409 Conflict for book with status pending (AC #7)", async () => {
      mockGetBookById.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "pending",
      });

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
      expect(response.body.error.message).toBe("Book is not in quarantine");
      expect(response.body.error.details.currentStatus).toBe("pending");
    });

    it("should return 409 Conflict for book with status enriched (AC #7)", async () => {
      mockGetBookById.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
      });

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
      expect(response.body.error.message).toBe("Book is not in quarantine");
      expect(response.body.error.details.currentStatus).toBe("enriched");
    });

    it("should return 403 Forbidden for regular user (AC #6)", async () => {
      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockRegularUser));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 401 Unauthorized for unauthenticated request", async () => {
      const response = await request(app).post("/api/v1/quarantine/1/approve");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 400 for invalid bookId (NaN)", async () => {
      const response = await request(app)
        .post("/api/v1/quarantine/invalid/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toBe("Invalid book ID");
    });

    it("should return 400 for invalid bookId (0)", async () => {
      const response = await request(app)
        .post("/api/v1/quarantine/0/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for negative bookId", async () => {
      const response = await request(app)
        .post("/api/v1/quarantine/-1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return updated book data with status enriched in response", async () => {
      const updatedBook = {
        ...mockQuarantinedBook,
        status: "enriched",
        failure_reason: null,
        updated_at: new Date("2024-01-02T10:00:00Z"),
      };
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockResolvedValue(updatedBook);

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: 1,
        title: "Test Book",
        status: "enriched",
        content_type: "book",
      });
    });

    it("should not emit WebSocket or update when book not found", async () => {
      mockGetBookById.mockResolvedValue(null);

      await request(app)
        .post("/api/v1/quarantine/999/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(mockUpdateBook).not.toHaveBeenCalled();
      expect(mockEmitBookUpdated).not.toHaveBeenCalled();
    });

    it("should not emit WebSocket or update when book not in quarantine", async () => {
      mockGetBookById.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
      });

      await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(mockUpdateBook).not.toHaveBeenCalled();
      expect(mockEmitBookUpdated).not.toHaveBeenCalled();
    });

    it("should return 500 when updateBook throws an unexpected error", async () => {
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_ERROR");
      expect(response.body.error.message).toBe("Failed to approve book");
      expect(mockEmitBookUpdated).not.toHaveBeenCalled();
    });

    it("should still return success even if emitBookUpdated throws (fire-and-forget)", async () => {
      mockGetBookById.mockResolvedValue(mockQuarantinedBook);
      mockUpdateBook.mockResolvedValue({
        ...mockQuarantinedBook,
        status: "enriched",
        failure_reason: null,
      });
      mockEmitBookUpdated.mockImplementation(() => {
        throw new Error("WebSocket broadcast failed");
      });

      const response = await request(app)
        .post("/api/v1/quarantine/1/approve")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      // WebSocket failures are fire-and-forget - response should still succeed
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("enriched");
      expect(mockUpdateBook).toHaveBeenCalled();
    });
  });
});
