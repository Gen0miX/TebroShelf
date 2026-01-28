import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveToQuarantine, buildFailureReason, EnrichmentAttempt } from "./quarantineService";
import { getBookById, updateBook } from "../library/bookService";
import { emitEnrichmentFailed } from "../../websocket/event";

// Mock dependencies
vi.mock("../library/bookService");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("quarantineService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("moveToQuarantine", () => {
    const mockBookId = 123;
    const mockBook = {
      id: mockBookId,
      title: "Test Book",
      content_type: "book",
    };

    it("should update book status to 'quarantine' and set failure_reason", async () => {
      vi.mocked(getBookById).mockResolvedValue(mockBook as any);
      const failureReason = "Test Failure";
      const sourcesAttempted = ["openlibrary"];

      await moveToQuarantine(mockBookId, failureReason, sourcesAttempted);

      expect(updateBook).toHaveBeenCalledWith(mockBookId, {
        status: "quarantine",
        failure_reason: failureReason,
      });
    });

    it("should emit enrichment.failed WebSocket event with correct payload", async () => {
      vi.mocked(getBookById).mockResolvedValue(mockBook as any);
      const failureReason = "Test Failure";
      const sourcesAttempted = ["openlibrary", "googlebooks"];

      await moveToQuarantine(mockBookId, failureReason, sourcesAttempted);

      expect(emitEnrichmentFailed).toHaveBeenCalledWith(
        mockBookId,
        failureReason,
        mockBook.content_type,
        sourcesAttempted
      );
    });

    it("should handle book not found gracefully", async () => {
      vi.mocked(getBookById).mockResolvedValue(null);
      
      await moveToQuarantine(mockBookId, "Reason", []);

      expect(updateBook).not.toHaveBeenCalled();
      expect(emitEnrichmentFailed).not.toHaveBeenCalled();
    });

    it("should ensure failure_reason is specific per book", async () => {
      const book1 = { id: 1, title: "Book 1", content_type: "book" };
      const book2 = { id: 2, title: "Book 2", content_type: "book" };

      vi.mocked(getBookById)
        .mockResolvedValueOnce(book1 as any)
        .mockResolvedValueOnce(book2 as any);

      await moveToQuarantine(1, "Reason 1", ["source1"]);
      await moveToQuarantine(2, "Reason 2", ["source2"]);

      expect(updateBook).toHaveBeenCalledWith(1, expect.objectContaining({ failure_reason: "Reason 1" }));
      expect(updateBook).toHaveBeenCalledWith(2, expect.objectContaining({ failure_reason: "Reason 2" }));
    });
  });

  describe("buildFailureReason", () => {
    it("should return correct message for no sources", () => {
      expect(buildFailureReason([])).toBe("No enrichment sources available");
    });

    it("should return message for single source failure (Not found on OpenLibrary)", () => {
      const attempts: EnrichmentAttempt[] = [
        { source: "openlibrary", success: false, error: "Not found on OpenLibrary" }
      ];
      expect(buildFailureReason(attempts)).toBe("openlibrary: Not found on OpenLibrary");
    });

    it("should return message for multiple source failures", () => {
      const attempts: EnrichmentAttempt[] = [
        { source: "anilist", success: false, error: "Not found on AniList" },
        { source: "myanimelist", success: false, error: "MyAnimeList API timeout" },
        { source: "mangadex", success: false, error: "MangaDex rate limited" }
      ];
      const result = buildFailureReason(attempts);
      expect(result).toBe("anilist: Not found on AniList. myanimelist: MyAnimeList API timeout. mangadex: MangaDex rate limited");
    });

    it("should return message for all API timeout", () => {
      const attempts: EnrichmentAttempt[] = [
        { source: "openlibrary", success: false, error: "API timeout" },
        { source: "googlebooks", success: false, error: "API timeout" }
      ];
      expect(buildFailureReason(attempts)).toBe("API timeout on all sources (OpenLibrary, Google Books)");
    });
  });
});
