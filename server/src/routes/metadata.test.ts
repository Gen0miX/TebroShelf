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

// Mock service
vi.mock("../services/metadata/metadataSearchService", () => ({
  searchMetadata: vi.fn(),
  getAvailableSources: vi.fn(),
}));

import metadataRouter from "./metadata";
import { searchMetadata, getAvailableSources } from "../services/metadata/metadataSearchService";

const app = express();
app.use(express.json());
app.use("/api/v1/metadata", metadataRouter);

describe("Metadata Routes", () => {
  const mockAdminUser = { id: 1, username: "admin", role: "admin" };
  const mockRegularUser = { id: 2, username: "user", role: "user" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/metadata/search", () => {
    it("should return 200 with results (Task 3.9)", async () => {
      const mockResults = [{ title: "Test Book", source: "openlibrary" }];
      vi.mocked(searchMetadata).mockResolvedValue(mockResults as any);

      const response = await request(app)
        .get("/api/v1/metadata/search")
        .query({ query: "test", source: "openlibrary" })
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockResults);
      expect(searchMetadata).toHaveBeenCalledWith("test", "openlibrary");
    });

    it("should return 400 if query is missing (Task 3.10)", async () => {
      const response = await request(app)
        .get("/api/v1/metadata/search")
        .query({ source: "openlibrary" })
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 if source is invalid (Task 3.11)", async () => {
      const response = await request(app)
        .get("/api/v1/metadata/search")
        .query({ query: "test", source: "invalid" })
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(400);
    });

    it("should return 403 for regular user (Task 3.12)", async () => {
      const response = await request(app)
        .get("/api/v1/metadata/search")
        .query({ query: "test", source: "openlibrary" })
        .set("x-mock-user", JSON.stringify(mockRegularUser));

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated request (Task 3.13)", async () => {
      const response = await request(app)
        .get("/api/v1/metadata/search")
        .query({ query: "test", source: "openlibrary" });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/metadata/sources", () => {
    it("should return available sources (Task 3.14)", async () => {
      const mockSources = ["openlibrary", "anilist"];
      vi.mocked(getAvailableSources).mockReturnValue(mockSources as any);

      const response = await request(app)
        .get("/api/v1/metadata/sources")
        .set("x-mock-user", JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockSources);
    });
  });
});
