import { getBookById } from "../library/bookService";
import { enrichFromOpenLibrary } from "./enrichment/openLibraryEnrichment";
import { enrichFromGoogleBooks } from "./enrichment/googleBooksEnrichment";
import { emitEnrichmentProgress } from "../../websocket/event";
import { logger } from "../../utils/logger";

const context = "ebookEnrichmentPipeline";

export interface PipelineResult {
  success: boolean;
  bookId: number;
  source?: string;
  fieldsUpdated: string[];
  status: "enriched" | "quarantine" | "pending";
  error?: string;
}

/**
 * Run the enrichment pipeline for an ebook.
 */
export async function runEbookEnrichmentPipeline(
  bookId: number,
): Promise<PipelineResult> {
  logger.info("Starting enrichment pipeline", { context, bookId });

  const result: PipelineResult = {
    success: false,
    bookId,
    fieldsUpdated: [],
    status: "pending",
  };

  try {
    const book = await getBookById(bookId);
    if (!book) {
      result.error = "Book not found";
      return result;
    }

    // Only process ebooks with this pipeline
    if (book.content_type !== "book") {
      logger.info("Skipping non-ebook", {
        context,
        bookId,
        contentType: book.content_type,
      });
      return result;
    }

    emitEnrichmentProgress(bookId, "pipeline-started", {
      contentType: book.content_type,
    });

    // 1. Try OpenLibrary first
    const openLibraryResult = await enrichFromOpenLibrary(bookId);

    if (openLibraryResult.success) {
      result.success = true;
      result.source = "openlibrary";
      result.fieldsUpdated = openLibraryResult.fieldsUpdated;
      result.status = "enriched";
      return result;
    }

    logger.info("OpenLibrary failed, trying Google Books", { context, bookId });

    // 2. Try Google Books fallback
    const googleBooksResult = await enrichFromGoogleBooks(bookId);

    if (googleBooksResult.success) {
      result.success = true;
      result.source = "googlebooks";
      result.fieldsUpdated = googleBooksResult.fieldsUpdated;
      result.status = "enriched";
      return result;
    }

    // 3. All sources failed — return failure for orchestrator to handle quarantine
    logger.warn("All enrichment sources failed", { context, bookId });

    result.error = `OpenLibrary: ${openLibraryResult.error || "No match found"}. Google Books: ${googleBooksResult.error || "No match found"}`;

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("Enrichment pipeline failed", { context, bookId, error: err });
    return result;
  }
}
