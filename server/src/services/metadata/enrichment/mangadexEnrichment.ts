import { getBookById, updateBook } from "../../library/bookService";
import {
  searchManga,
  mapToBookMetadata,
  getCoverFileName,
  buildCoverUrl,
  getLocalizedString,
  MangaDexManga,
  getAuthorName,
  MangaDexLocalizedString,
} from "../sources/mangadexClient";
import {
  EnrichmentResult,
  cleanTitle,
  calculateSimilarity,
  normalizeString,
} from "../utils/metadataUtils";
import { emitEnrichmentProgress } from "../../../websocket/event";
import { downloadCover } from "../coverDownloader";
import { logger } from "../../../utils/logger";

const context = "mangadexEnrichment";

/**
 * Enrich manga metadata from MangaDex.
 * This is the LAST manga source before quarantine (Story 3.8).
 */
export async function enrichFromMangaDex(
  bookId: number,
): Promise<EnrichmentResult> {
  logger.info("Starting MangaDex enrichment", { context, bookId });

  const result: EnrichmentResult = {
    success: false,
    source: "mangadex",
    bookId,
    fieldsUpdated: [],
    coverUpdated: false,
  };

  try {
    const book = await getBookById(bookId);
    if (!book) {
      result.error = "Book not found";
      return result;
    }

    if (book.content_type !== "manga") {
      result.error = "Not a manga";
      return result;
    }

    emitEnrichmentProgress(bookId, "mangadex-search-started", {
      title: book.title,
    });

    // Clean and search title
    const searchTitle = cleanTitle(book.title);
    const results = await searchManga(searchTitle);

    if (results.length === 0) {
      logger.info("No MangaDex match found", { context, bookId, searchTitle });
      emitEnrichmentProgress(bookId, "mangadex-no-match", {});
      result.error = "No matching manga found on MangaDex";
      return result;
    }

    // Select best match
    const match = selectBestMatch(results, searchTitle);

    if (!match) {
      result.error = "No sufficiently similar match found on MangaDex";
      emitEnrichmentProgress(bookId, "mangadex-no-match", {});
      return result;
    }

    emitEnrichmentProgress(bookId, "mangadex-match-found", {
      matchTitle: getLocalizedString(match.attributes.title),
      matchId: match.id,
    });

    // Map to BookMetadata
    const metadata = mapToBookMetadata(match);

    // Download cover if available and not already present
    if (!book.cover_path) {
      const coverFileName = getCoverFileName(match.relationships);
      if (coverFileName) {
        const coverUrl = buildCoverUrl(match.id, coverFileName);
        const coverPath = await downloadCover(coverUrl, bookId);
        if (coverPath) {
          metadata.cover_path = coverPath;
          result.coverUpdated = true;
        }
      }
    }

    // Update only missing fields
    const updateData: Record<string, unknown> = {};

    if (metadata.title && !book.title) {
      updateData.title = metadata.title;
      result.fieldsUpdated.push("title");
    }
    if (metadata.author && !book.author) {
      updateData.author = metadata.author;
      result.fieldsUpdated.push("author");
    }
    if (metadata.description && !book.description) {
      updateData.description = metadata.description;
      result.fieldsUpdated.push("description");
    }
    if (metadata.genres && (!book.genres || book.genres === "[]")) {
      updateData.genres = metadata.genres;
      result.fieldsUpdated.push("genres");
    }
    if (metadata.publication_date && !book.publication_date) {
      updateData.publication_date = metadata.publication_date;
      result.fieldsUpdated.push("publication_date");
    }
    if (metadata.publication_status && !book.publication_status) {
      updateData.publication_status = metadata.publication_status;
      result.fieldsUpdated.push("publication_status");
    }
    if (metadata.cover_path) {
      updateData.cover_path = metadata.cover_path;
      result.fieldsUpdated.push("cover_path");
    }

    // Update book record
    if (Object.keys(updateData).length > 0) {
      await updateBook(bookId, { ...updateData, status: "enriched" });
      result.success = true;
    } else {
      await updateBook(bookId, { status: "enriched" });
      result.success = true;
    }

    emitEnrichmentProgress(bookId, "enrichment-completed", {
      source: "mangadex",
      fieldsUpdated: result.fieldsUpdated,
    });

    logger.info("MangaDex enrichment completed", { context, result });
    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("MangaDex enrichment failed", {
      context,
      bookId,
      error: err,
    });
    emitEnrichmentProgress(bookId, "enrichment-failed", {
      source: "mangadex",
      error: String(err),
    });
    return result;
  }
}

/**
 * Select best match using multi-variant title similarity.
 * Compares against title (localized), altTitles array.
 */
function selectBestMatch(
  results: MangaDexManga[],
  targetTitle: string,
): MangaDexManga | null {
  if (results.length === 0) return null;

  const normalizedTarget = normalizeString(targetTitle);

  let bestMatch = results[0];
  let bestScore = 0;

  for (const manga of results) {
    const variants: string[] = [];

    // Add all localized title variants
    const title = manga.attributes.title;
    if (title) {
      variants.push(...Object.values(title));
    }

    // Add all altTitle variants
    if (manga.attributes.altTitles) {
      for (const altTitle of manga.attributes.altTitles) {
        variants.push(...Object.values(altTitle));
      }
    }

    let bestTitleScore = 0;
    for (const variant of variants) {
      const variantScore = calculateSimilarity(
        normalizedTarget,
        normalizeString(variant),
      );
      if (variantScore > bestTitleScore) {
        bestTitleScore = variantScore;
      }
    }

    let score = bestTitleScore * 80; // Title weight: 80%

    // Bonus for having more metadata
    if (manga.attributes.description && Object.keys(manga.attributes.description).length > 0) score += 5;
    if (getCoverFileName(manga.relationships)) score += 5;
    if (getAuthorName(manga.relationships)) score += 5;
    if (manga.attributes.tags.length > 0) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = manga;
    }
  }

  // Minimum score threshold
  if (bestScore < 40) {
    logger.warn("Best MangaDex match score too low", {
      context,
      bestScore,
      bestMatch: getLocalizedString(bestMatch.attributes.title),
    });
    return null;
  }

  return bestMatch;
}
