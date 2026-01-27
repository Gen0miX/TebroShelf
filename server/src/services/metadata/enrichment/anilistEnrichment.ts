import { getBookById, updateBook } from "../../library/bookService";
import {
  searchManga,
  mapToBookMetadata,
  getCoverUrl,
  AniListMedia,
} from "../sources/anilistClient";
import {
  emitEnrichmentStarted,
  emitEnrichmentProgress,
  emitEnrichmentCompleted,
} from "../../../websocket/event";
import { downloadCover } from "../coverDownloader";
import { logger } from "../../../utils/logger";

const context = "anilistEnrichment";

export interface EnrichmentResult {
  success: boolean;
  source: string;
  bookId: number;
  fieldsUpdated: string[];
  coverUpdated: boolean;
  error?: string;
}

/**
 * Enrich manga metadata from AniList.
 */
export async function enrichFromAniList(
  bookId: number,
): Promise<EnrichmentResult> {
  logger.info("Starting AniList enrichment", { context, bookId });

  const result: EnrichmentResult = {
    success: false,
    source: "anilist",
    bookId,
    fieldsUpdated: [],
    coverUpdated: false,
  };

  try {
    // 1. Load book record
    const book = await getBookById(bookId);
    if (!book) {
      result.error = "Book not found";
      return result;
    }

    if (book.content_type !== "manga") {
      result.error = "Not a manga (use ebook enrichment for books)";
      return result;
    }

    emitEnrichmentStarted(bookId, {
      source: "anilist",
      title: book.title,
    });

    // 2. Clean and search title
    const searchTitle = cleanTitle(book.title);
    const results = await searchManga(searchTitle);

    if (results.length === 0) {
      logger.info("No AniList match found", { context, bookId, searchTitle });
      emitEnrichmentProgress(bookId, "anilist-no-match", { title: book.title });
      result.error = "No matching manga found on AniList";
      return result;
    }

    // 3. Select best match using title similarity
    const match = selectBestMatch(results, searchTitle);

    if (!match) {
      result.error = "No sufficiently similar match found on AniList";
      emitEnrichmentProgress(bookId, "anilist-no-match", { title: book.title });
      return result;
    }

    emitEnrichmentProgress(bookId, "anilist-match-found", {
      matchTitle:
        match.title.english || match.title.romaji || match.title.native,
      matchId: match.id,
    });

    // 4. Map to BookMetadata
    const metadata = mapToBookMetadata(match);

    // 5. Download cover if available and not already present
    if (match.coverImage && !book.cover_path) {
      const coverUrl = getCoverUrl(match.coverImage);
      if (coverUrl) {
        const coverPath = await downloadCover(coverUrl, bookId);
        if (coverPath) {
          metadata.cover_path = coverPath;
          result.coverUpdated = true;
        }
      }
    }

    // 6. Determine which fields to update (only missing or improved)
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

    // 7. Update book record
    if (Object.keys(updateData).length > 0) {
      await updateBook(bookId, {
        ...updateData,
        status: "enriched",
      });
      result.success = true;
    } else {
      // No new fields to update, but we found a match
      await updateBook(bookId, { status: "enriched" });
      result.success = true;
    }

    emitEnrichmentCompleted(bookId, {
      source: "anilist",
      fieldsUpdated: result.fieldsUpdated,
    });

    logger.info("AniList enrichment completed", { context, result });

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("AniList enrichment failed", { context, bookId, error: err });
    emitEnrichmentProgress(bookId, "enrichment-failed", {
      source: "anilist",
      error: String(err),
    });
    return result;
  }
}

/**
 * Clean title for search (remove volume numbers, file artifacts).
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\bv(?:ol(?:ume)?)?\.?\s*\d+/gi, "") // Remove vol/volume numbers
    .replace(/\b(?:tome|t)\s*\d+/gi, "") // Remove tome numbers (French)
    .replace(/\[.*?\]/g, "") // Remove bracketed content
    .replace(/\(.*?\)/g, "") // Remove parenthesized content
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Select best match using multi-variant title similarity
 */
export function selectBestMatch(
  results: AniListMedia[],
  targetTitle: string,
): AniListMedia | null {
  if (results.length === 0) return null;

  const normalizedTarget = normalizeString(targetTitle);

  let bestMatch = results[0];
  let bestScore = 0;

  for (const media of results) {
    let score = 0;

    // Compare against all title variants and take best
    const variants = [
      media.title.english,
      media.title.romaji,
      media.title.native,
      ...(media.synonyms || []),
    ].filter(Boolean) as string[];

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

    score += bestTitleScore * 80; // Title weight: 80%

    // Bonus for MANGA format (vs NOVEL, ONE_SHOT)
    if (media.format === "MANGA") {
      score += 10;
    }

    // Bonus for popularity (averageScore)
    if (media.averageScore) {
      score += (media.averageScore / 100) * 10; // Up to 10 points
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = media;
    }
  }

  // Minimum score threshold
  if (bestScore < 40) {
    logger.warn("Best AniList match score too low", {
      context,
      bestScore,
      bestMatch: bestMatch.title.english || bestMatch.title.romaji,
    });
    return null;
  }

  return bestMatch;
}

export function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  // Jaccard-like character set similarity
  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));

  const intersection = [...aChars].filter((c) => bChars.has(c)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return (intersection / union) * 100;
}
