import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitEnrichmentFailed } from "./event";
import { broadcast } from "./wsServer";

// Mock the broadcast function
vi.mock("./wsServer", () => ({
  broadcast: vi.fn(),
}));

describe("WebSocket Events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("emitEnrichmentFailed", () => {
    it("should broadcast an enrichment.failed event with the correct structure", () => {
      const bookId = 42;
      const failureReason = "API timeout on all sources (OpenLibrary, Google Books)";
      const contentType = "book";
      const sourcesAttempted = ["openlibrary", "googlebooks"];

      emitEnrichmentFailed(bookId, failureReason, contentType, sourcesAttempted);

      // Verify broadcast was called
      expect(broadcast).toHaveBeenCalledTimes(1);
      
      const callArgs = vi.mocked(broadcast).mock.calls[0][0];
      
      // AC 9.2: Test event type
      expect(callArgs.type).toBe("enrichment.failed");
      
      // AC 9.3: Test payload content
      expect(callArgs.payload).toEqual({
        bookId,
        failureReason,
        contentType,
        sourcesAttempted,
      });

      // AC 9.4: Test timestamp is ISO 8601
      expect(callArgs.timestamp).toBeDefined();
      // Simple ISO 8601 regex check: YYYY-MM-DDTHH:mm:ss.sssZ
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(callArgs.timestamp).toMatch(iso8601Regex);
    });
  });
});
