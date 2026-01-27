import { getBookById, updateBook } from "../../library/bookService";
import {
  searchManga,
  mapToBookMetadata,
  getCoverUrl,
  MalMangaNode,
} from "../sources/malClient";
import { emitEnrichmentProgress } from "../../../websocket/event";
import { downloadCover } from "../coverDownloader";
import {
  EnrichmentResult,
  cleanTitle,
  normalizeString,
  calculateSimilarity,
} from "../utils/metadataUtils";
import { logger } from "../../../utils/logger";
import { getScrapingConfig } from "../../../config/scraping";

const context = "malEnrichment";

/**
 * Enrich manga metadata from MyAnimeList
 */
export async function enrichFromMyAnimeList(
  bookId: number,
): Promise<EnrichmentResult> {
  logger.info("Starting MyAnimeList enrichment", { context, bookId });

  const result: EnrichmentResult = {
    success: false,
    source: "myanimelist",
    bookId,
    fieldsUpdated: [],
    coverUpdated: false,
  };

  // Check API key availability
  const config = getScrapingConfig().myAnimeList;
  if (!config.clientId) {
    result.error = "MAL_CLIENT_ID not configured";
    logger.warn("MAL enrichment skipped: no client ID", { context, bookId });
    return result;
  }

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

    emitEnrichmentProgress(bookId, "mal-search-started", { title: book.title });

    // Clean and search title
    const searchTitle = cleanTitle(book.title);
    const results = await searchManga(searchTitle);

    if (results.length === 0) {
      logger.info("No MAL match found", { context, bookId, searchTitle });
      emitEnrichmentProgress(bookId, "mal-no-match", {});
      result.error = "No matching manga found on MyAnimeList";
      return result;
    }

    // Select best match
    const match = selectBestMatch(results, searchTitle);

    if (!match) {
      result.error = "No sufficiently similar match found on MyAnimeList";
      emitEnrichmentProgress(bookId, "mal-no-match", {});
      return result;
    }

    emitEnrichmentProgress(bookId, "mal-match-found", {
      matchTitle: match.title,
      matchId: match.id,
    });

    // Map to BookMetadata
    const metadata = mapToBookMetadata(match);

    // Download cover if available and not already present
    if (match.main_picture && !book.cover_path) {
      const coverUrl = getCoverUrl(match.main_picture);
      if (coverUrl) {
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
      source: "myanimelist",
      fieldsUpdated: result.fieldsUpdated,
    });

    logger.info("MAL enrichment completed", { context, result });
    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("MAL enrichment failed", { context, bookId, error: err });
    emitEnrichmentProgress(bookId, "enrichment-failed", {
      source: "myanimelist",
      error: String(err),
    });
    return result;
  }
}

/**
 * Select best match using multi-variant title similarity.
 * Compares against title, alternative_titles.en, .ja, and synonyms.
 */
function selectBestMatch(
  results: MalMangaNode[],
  targetTitle: string,
): MalMangaNode | null {
  if (results.length === 0) return null;

  const normalizedTarget = normalizeString(targetTitle);

  let bestMatch = results[0];
  let bestScore = 0;

  for (const manga of results) {
    const variants: string[] = [manga.title];

    if (manga.alternative_titles) {
      if (manga.alternative_titles.en)
        variants.push(manga.alternative_titles.en);
      if (manga.alternative_titles.ja)
        variants.push(manga.alternative_titles.ja);
      if (manga.alternative_titles.synonyms) {
        variants.push(...manga.alternative_titles.synonyms);
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

    // Bonus for manga media type (vs novel, one_shot)
    if (manga.media_type === "manga") {
      score += 10;
    }

    // Bonus for having more metadata
    if (manga.synopsis) score += 5;
    if (manga.main_picture) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = manga;
    }
  }

  // Minimum score threshold
  if (bestScore < 40) {
    logger.warn("Best MAL match score too low", {
      context,
      bestScore,
      bestMatch: bestMatch.title,
    });
    return null;
  }

  return bestMatch;
}
