import { getBookById } from "../library/bookService";
import { enrichFromAniList } from "./enrichment/anilistEnrichment";
import { enrichFromMyAnimeList } from "./enrichment/malEnrichment";
import { emitEnrichmentProgress } from "../../websocket/event";
import { logger } from "../../utils/logger";

const context = "mangaEnrichmentPipeline";

export interface MangaPipelineResult {
  success: boolean;
  bookId: number;
  source?: string;
  fieldsUpdated: string[];
  status: "enriched" | "pending" | "quarantine";
  error?: string;
}

/**
 * Run the manga enrichment pipeline.
 * Story 3.5: AniList first.
 * Story 3.6: MyAnimeList fallback.
 * Story 3.7 will add MangaDex fallback.
 */
export async function runMangaEnrichmentPipeline(
  bookId: number,
): Promise<MangaPipelineResult> {
  logger.info("Starting manga enrichment pipeline", { context, bookId });

  const result: MangaPipelineResult = {
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

    if (book.content_type !== "manga") {
      logger.info("Skipping non-manga", {
        context,
        bookId,
        contentType: book.content_type,
      });
      return result;
    }

    emitEnrichmentProgress(bookId, "manga-pipeline-started", {
      contentType: book.content_type,
    });

    // 1. Try AniList first
    const anilistResult = await enrichFromAniList(bookId);

    if (anilistResult.success) {
      result.success = true;
      result.source = "anilist";
      result.fieldsUpdated = anilistResult.fieldsUpdated;
      result.status = "enriched";
      return result;
    }

    logger.info("AniList failed, manga remains pending for MAL fallback", {
      context,
      bookId,
      error: anilistResult.error,
    });

    // 2. Try MyAnimeList as fallback
    const malResult = await enrichFromMyAnimeList(bookId);

    if (malResult.success) {
      result.success = true;
      result.source = "myanimelist";
      result.fieldsUpdated = malResult.fieldsUpdated;
      result.status = "enriched";
      return result;
    }

    logger.info(
      "MyAnimeList failed, manga remains pending for MangaDex fallback",
      {
        context,
        bookId,
        malError: malResult.error,
      },
    );

    // Story 3.7 will add: enrichFromMangaDex(bookId)
    // Story 3.8 will add: quarantine on all failures

    // For now, leave as pending for future fallback sources
    result.error = malResult.error;
    result.status = "pending";

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("Manga enrichment pipeline failed", {
      context,
      bookId,
      error: err,
    });
    return result;
  }
}
