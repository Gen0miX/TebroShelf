import { getBookById, updateBook } from "../library/bookService";
import { emitEnrichmentFailed } from "../../websocket/event";
import { logger } from "../../utils/logger";

const context = "quarantineService";

export interface EnrichmentAttempt {
  source: string; // "openlibrary", "googlebooks", "anilist", "myanimelist", "mangadex"
  success: boolean;
  error?: string; // Specific error: "No matching results", "API timeout", "Rate limited"
}

/**
 * Move a book to quarantine with detailed failure tracking.
 */
export async function moveToQuarantine(
  bookId: number,
  failureReason: string,
  sourcesAttempted: string[],
): Promise<void> {
  const book = await getBookById(bookId);
  if (!book) return;

  await updateBook(bookId, {
    status: "quarantine",
    failure_reason: failureReason,
  });

  emitEnrichmentFailed(
    bookId,
    failureReason,
    book.content_type,
    sourcesAttempted,
  );

  logger.warn("Book moved to quarantine", {
    context,
    bookId,
    title: book.title,
    contentType: book.content_type,
    failureReason,
    sourcesAttempted,
  });
}

/**
 * Build human-readable failure reason from enrichment attempts.
 */
export function buildFailureReason(attempts: EnrichmentAttempt[]): string {
  if (attempts.length === 0) {
    return "No enrichment sources available";
  }

  const failedAttempts = attempts.filter((a) => !a.success);

  if (failedAttempts.length === 0) {
    return "Unknown enrichment failure";
  }

  // Handle all API timeout case (Task 6.7)
  const isAllTimeout =
    failedAttempts.length === attempts.length &&
    failedAttempts.every((a) => a.error === "API timeout");

  if (isAllTimeout) {
    const sources = attempts.map((a) => {
      // Format source names nicely for the message
      if (a.source === "openlibrary") return "OpenLibrary";
      if (a.source === "googlebooks") return "Google Books";
      if (a.source === "anilist") return "AniList";
      if (a.source === "myanimelist") return "MyAnimeList";
      if (a.source === "mangadex") return "MangaDex";
      return a.source;
    });
    return `API timeout on all sources (${sources.join(", ")})`;
  }

  const reasons = failedAttempts.map((a) => {
    const error = a.error || "Unknown error";
    return `${a.source}: ${error}`;
  });

  return reasons.join(". ");
}
