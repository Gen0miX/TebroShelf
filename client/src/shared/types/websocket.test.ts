import { describe, it, expect } from "vitest";
import type { WebSocketMessage } from "./websocket";
import {
  isFileDetectedMessage,
  isScanCompletedMessage,
  isEnrichmentStartedMessage,
  isEnrichmentProgressMessage,
  isEnrichmentCompletedMessage,
  isEnrichmentFailedMessage,
  isBookUpdatedMessage,
} from "./websocket";

describe("WebSocket type guards", () => {
  const createMessage = (type: string, payload: unknown): WebSocketMessage => ({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });

  describe("isFileDetectedMessage", () => {
    it("should return true for file.detected message", () => {
      const message = createMessage("file.detected", {
        filename: "test.epub",
        contentType: "book",
        bookId: 1,
        timestamp: "2026-01-01T00:00:00Z",
      });
      expect(isFileDetectedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(
        isFileDetectedMessage(createMessage("scan.completed", {})),
      ).toBe(false);
      expect(
        isFileDetectedMessage(createMessage("enrichment.started", {})),
      ).toBe(false);
    });
  });

  describe("isScanCompletedMessage", () => {
    it("should return true for scan.completed message", () => {
      const message = createMessage("scan.completed", {
        filesFound: 5,
        filesProcessed: 3,
        filesSkipped: 2,
        errors: 0,
        duration: 1000,
      });
      expect(isScanCompletedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(isScanCompletedMessage(createMessage("file.detected", {}))).toBe(
        false,
      );
    });
  });

  describe("isEnrichmentStartedMessage", () => {
    it("should return true for enrichment.started message", () => {
      const message = createMessage("enrichment.started", {
        bookId: 1,
        step: "started",
        details: { contentType: "book" },
      });
      expect(isEnrichmentStartedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(
        isEnrichmentStartedMessage(createMessage("enrichment.progress", {})),
      ).toBe(false);
      expect(
        isEnrichmentStartedMessage(createMessage("enrichment.completed", {})),
      ).toBe(false);
    });
  });

  describe("isEnrichmentProgressMessage", () => {
    it("should return true for enrichment.progress message", () => {
      const message = createMessage("enrichment.progress", {
        bookId: 1,
        step: "openlibrary-search-started",
        details: {},
      });
      expect(isEnrichmentProgressMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(
        isEnrichmentProgressMessage(createMessage("enrichment.started", {})),
      ).toBe(false);
      expect(
        isEnrichmentProgressMessage(createMessage("enrichment.completed", {})),
      ).toBe(false);
    });
  });

  describe("isEnrichmentCompletedMessage", () => {
    it("should return true for enrichment.completed message", () => {
      const message = createMessage("enrichment.completed", {
        bookId: 1,
        step: "completed",
        details: { source: "openlibrary", fieldsUpdated: ["title", "author"] },
      });
      expect(isEnrichmentCompletedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(
        isEnrichmentCompletedMessage(createMessage("enrichment.started", {})),
      ).toBe(false);
      expect(
        isEnrichmentCompletedMessage(createMessage("enrichment.failed", {})),
      ).toBe(false);
    });
  });

  describe("isEnrichmentFailedMessage", () => {
    it("should return true for enrichment.failed message", () => {
      const message = createMessage("enrichment.failed", {
        bookId: 1,
        failureReason: "No match found",
        contentType: "book",
        sourcesAttempted: ["openlibrary", "googlebooks"],
      });
      expect(isEnrichmentFailedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(
        isEnrichmentFailedMessage(createMessage("enrichment.completed", {})),
      ).toBe(false);
      expect(
        isEnrichmentFailedMessage(createMessage("book.updated", {})),
      ).toBe(false);
    });
  });

  describe("isBookUpdatedMessage", () => {
    it("should return true for book.updated message", () => {
      const message = createMessage("book.updated", {
        bookId: 1,
        details: { status: "enriched" },
      });
      expect(isBookUpdatedMessage(message)).toBe(true);
    });

    it("should return false for other message types", () => {
      expect(isBookUpdatedMessage(createMessage("file.detected", {}))).toBe(
        false,
      );
      expect(
        isBookUpdatedMessage(createMessage("enrichment.failed", {})),
      ).toBe(false);
    });
  });
});
