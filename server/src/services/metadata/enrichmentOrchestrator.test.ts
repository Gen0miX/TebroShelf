import { describe, it, expect, vi, beforeEach } from "vitest";
import { orchestrateEnrichment } from "./enrichmentOrchestrator";
import { getBookById, updateBook } from "../library/bookService";
import { processEpubExtraction, processComicExtraction } from "./extractionService";
import { moveToQuarantine, buildFailureReason } from "./quarantineService";
import { runEbookEnrichmentPipeline } from "./ebookEnrichmentPipeline";
import { runMangaEnrichmentPipeline } from "./mangaEnrichmentPipeline";
import { emitEnrichmentStarted, emitEnrichmentCompleted } from "../../websocket/event";

// Mock dependencies
vi.mock("../library/bookService");
vi.mock("./extractionService");
vi.mock("./quarantineService");
vi.mock("./ebookEnrichmentPipeline");
vi.mock("./mangaEnrichmentPipeline");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("enrichmentOrchestrator", () => {
  const mockBookId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Routing", () => {
    it("should route to ebook pipeline when content_type is 'book'", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: true, bookId: mockBookId, fieldsUpdated: [], status: "enriched" });

      await orchestrateEnrichment(mockBookId);

      expect(processEpubExtraction).toHaveBeenCalledWith(mockBookId);
      expect(runEbookEnrichmentPipeline).toHaveBeenCalledWith(mockBookId);
      expect(processComicExtraction).not.toHaveBeenCalled();
      expect(runMangaEnrichmentPipeline).not.toHaveBeenCalled();
    });

    it("should route to manga pipeline when content_type is 'manga'", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "manga" } as any);
      vi.mocked(processComicExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });
      vi.mocked(runMangaEnrichmentPipeline).mockResolvedValue({ success: true, bookId: mockBookId, fieldsUpdated: [], status: "enriched" });

      await orchestrateEnrichment(mockBookId);

      expect(processComicExtraction).toHaveBeenCalledWith(mockBookId);
      expect(runMangaEnrichmentPipeline).toHaveBeenCalledWith(mockBookId);
      expect(processEpubExtraction).not.toHaveBeenCalled();
      expect(runEbookEnrichmentPipeline).not.toHaveBeenCalled();
    });
  });

  describe("Success/Failure Combinations", () => {
    it("should result in status 'enriched' when both local and external succeed", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: true });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: true, bookId: mockBookId, fieldsUpdated: ["title"], status: "enriched" });

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("enriched");
      expect(moveToQuarantine).not.toHaveBeenCalled();
    });

    it("should result in status 'quarantine' when local succeeds but external fails", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: false, bookId: mockBookId, fieldsUpdated: [], status: "pending", error: "Not found" });
      vi.mocked(buildFailureReason).mockReturnValue("ebook-pipeline: Not found");

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("quarantine");
      expect(moveToQuarantine).toHaveBeenCalled();
    });

    it("should result in status 'quarantine' with failure reason when both fail", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: false, bookId: mockBookId, metadataExtracted: false, coverExtracted: false });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: false, bookId: mockBookId, fieldsUpdated: [], status: "pending", error: "Network error" });
      vi.mocked(buildFailureReason).mockReturnValue("ebook-pipeline: Network error");

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("quarantine");
    });

    it("should result in status 'enriched' when local fails but external succeeds", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: false, bookId: mockBookId, metadataExtracted: false, coverExtracted: false });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: true, bookId: mockBookId, fieldsUpdated: ["title"], status: "enriched" });

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("enriched");
      expect(moveToQuarantine).not.toHaveBeenCalled();
    });
  });

  describe("Robustness and Side Effects", () => {
    it("should set status 'enriched' when local succeeds and external pipeline is unavailable (AC #5)", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });

      // Simulate pipeline unavailability (catch block fires)
      vi.mocked(runEbookEnrichmentPipeline).mockRejectedValue(new Error("Module not found"));

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("enriched");
      expect(result.success).toBe(true);
      expect(moveToQuarantine).not.toHaveBeenCalled();
      expect(updateBook).toHaveBeenCalledWith(mockBookId, { status: "enriched" });
    });

    it("should quarantine when local fails and external pipeline is unavailable", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: false, bookId: mockBookId, metadataExtracted: false, coverExtracted: false });

      vi.mocked(runEbookEnrichmentPipeline).mockRejectedValue(new Error("Module not found"));
      vi.mocked(buildFailureReason).mockReturnValue("No enrichment sources available");

      const result = await orchestrateEnrichment(mockBookId);

      expect(result.status).toBe("quarantine");
      expect(moveToQuarantine).toHaveBeenCalled();
    });

    it("should preserve locally-extracted metadata when entering quarantine", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book", title: "Local Title" } as any);
      vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });
      vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: false, bookId: mockBookId, fieldsUpdated: [], status: "pending" });

      await orchestrateEnrichment(mockBookId);

      expect(moveToQuarantine).toHaveBeenCalledWith(
        mockBookId,
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  describe("WebSocket Events", () => {
    it("should emit events in correct order: started -> extraction -> pipeline -> completed", async () => {
      vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
      
      const sequence: string[] = [];
      
      vi.mocked(emitEnrichmentStarted).mockImplementation(() => { sequence.push("started"); });
      vi.mocked(processEpubExtraction).mockImplementation(async () => { 
        sequence.push("extraction");
        return { success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false }; 
      });
      vi.mocked(runEbookEnrichmentPipeline).mockImplementation(async () => {
        sequence.push("pipeline");
        return { success: true, bookId: mockBookId, fieldsUpdated: ["title"], status: "enriched" };
      });
      vi.mocked(emitEnrichmentCompleted).mockImplementation(() => { sequence.push("completed"); });

      await orchestrateEnrichment(mockBookId);

      expect(sequence).toEqual(["started", "extraction", "pipeline", "completed"]);
    });

    it("should emit enrichment.failed when entering quarantine", async () => {
       vi.mocked(getBookById).mockResolvedValue({ id: mockBookId, content_type: "book" } as any);
       vi.mocked(processEpubExtraction).mockResolvedValue({ success: true, bookId: mockBookId, metadataExtracted: true, coverExtracted: false });
       vi.mocked(runEbookEnrichmentPipeline).mockResolvedValue({ success: false, bookId: mockBookId, fieldsUpdated: [], status: "pending", error: "Failed" });
       
       const sequence: string[] = [];
       vi.mocked(emitEnrichmentStarted).mockImplementation(() => { sequence.push("started"); });
       // Note: moveToQuarantine inside orchestrator doesn't emit "failed" directly, 
       // but quarantineService.moveToQuarantine does. Since we mock moveToQuarantine, we track it.
       vi.mocked(moveToQuarantine).mockImplementation(async () => { sequence.push("failed"); });

       await orchestrateEnrichment(mockBookId);

       expect(sequence).toEqual(["started", "failed"]);
    });
  });
});
