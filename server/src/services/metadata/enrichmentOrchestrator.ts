import { getBookById, updateBook } from "../library/bookService";
import {
  processEpubExtraction,
  processComicExtraction,
} from "./extractionService";
import {
  moveToQuarantine,
  buildFailureReason,
  EnrichmentAttempt,
} from "./quarantineService";
import {
  emitEnrichmentStarted,
  emitEnrichmentCompleted,
} from "../../websocket/event";
import { logger } from "../../utils/logger";

const context = "enrichmentOrchestrator";

export interface EnrichmentOrchestratorResult {
  success: boolean;
  bookId: number;
  status: "enriched" | "quarantine" | "pending";
  source?: string;
  failureReason?: string;
}

/**
 * Orchestrate the full enrichment pipeline for a book:
 * 1. Local extraction (EPUB OPF / ComicInfo.xml)
 * 2. External API enrichment (ebook or manga pipeline)
 * 3. Quarantine on total failure
 */
export async function orchestrateEnrichment(
  bookId: number,
): Promise<EnrichmentOrchestratorResult> {
  const result: EnrichmentOrchestratorResult = {
    success: false,
    bookId,
    status: "pending",
  };

  try {
    const book = await getBookById(bookId);
    if (!book) {
      result.failureReason = "Book not found";
      return result;
    }

    emitEnrichmentStarted(bookId, { contentType: book.content_type });

    // Step 1: Local extraction
    const localResult =
      book.content_type === "book"
        ? await processEpubExtraction(bookId)
        : await processComicExtraction(bookId);

    // Step 2: External enrichment pipeline
    const attempts: EnrichmentAttempt[] = [];
    let externalSuccess = false;
    let externalUnavailable = false;
    const pipelineSource =
      book.content_type === "book" ? "ebook-pipeline" : "manga-pipeline";

    try {
      if (book.content_type === "book") {
        // Stories 3.3/3.4: OpenLibrary -> Google Books
        const { runEbookEnrichmentPipeline } = await import(
          "./ebookEnrichmentPipeline.js"
        );
        const pipelineResult = await runEbookEnrichmentPipeline(bookId);
        externalSuccess = pipelineResult.success;

        if (!externalSuccess) {
          attempts.push({
            source: pipelineSource,
            success: false,
            error: pipelineResult.error || "Pipeline returned failure",
          });
        }
      } else {
        // Stories 3.5/3.6/3.7: AniList -> MAL -> MangaDex
        const { runMangaEnrichmentPipeline } = await import(
          "./mangaEnrichmentPipeline.js"
        );
        const pipelineResult = await runMangaEnrichmentPipeline(bookId);
        externalSuccess = pipelineResult.success;

        if (!externalSuccess) {
          attempts.push({
            source: pipelineSource,
            success: false,
            error: pipelineResult.error || "Pipeline returned failure",
          });
        }
      }
    } catch (importErr) {
      // Graceful degradation: external pipelines not yet implemented
      externalUnavailable = true;
      logger.warn("External enrichment pipeline not available", {
        context,
        bookId,
        error: importErr,
      });
    }

    // Step 3: Determine final status
    if (externalSuccess) {
      result.success = true;
      result.status = "enriched";
      emitEnrichmentCompleted(bookId, { contentType: book.content_type });
    } else if (localResult.success && externalUnavailable) {
      // AC #5: Local extraction succeeded, external pipeline not available → enriched
      await updateBook(bookId, { status: "enriched" });
      result.success = true;
      result.status = "enriched";
      emitEnrichmentCompleted(bookId, { source: "local" });
    } else {
      // External pipeline failed or returned failure → quarantine
      const failureReason = buildFailureReason(attempts);
      await moveToQuarantine(
        bookId,
        failureReason,
        attempts.map((a) => a.source),
      );
      result.status = "quarantine";
      result.failureReason = failureReason;
    }
    return result;
  } catch (err) {
    logger.error("Enrichment orchestration failed", {
      context,
      bookId,
      error: err,
    });
    const errorMsg = (err as Error).message || String(err);
    await moveToQuarantine(bookId, errorMsg, ["orchestrator"]);
    result.status = "quarantine";
    result.failureReason = errorMsg;
    return result;
  }
}
