import { getBookById, updateBook } from "../../library/bookService";
import {
  searchByISBN,
  searchByTitle,
  mapToBookMetadata,
  getCoverUrl,
  fetchWorkDescription,
  OpenLibraryBook,
} from "../sources/openLibraryClient";
import {
  emitEnrichmentProgress,
  emitEnrichmentCompleted,
} from "../../../websocket/event";
import { downloadCover, isCoverLowQuality } from "../coverDownloader";
import { logger } from "../../../utils/logger";
import { BookMetadata } from "../../../db/schema";

const context = "openLibraryEnrichment";

export interface EnrichmentResult {
  success: boolean;
  source: "openlibrary" | "googlebooks" | "extraction" | "manual";
  bookId: number;
  fieldsUpdated: string[];
  coverUpdated: boolean;
  error?: string;
}

/**
 * Enrich book metadata from Openlibrary
 */
export async function enrichFromOpenLibrary(
  bookId: number,
): Promise<EnrichmentResult> {
  logger.info("Starting OpenLibrary enrichment", { context, bookId });

  const result: EnrichmentResult = {
    success: false,
    source: "openlibrary",
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

    if (book.content_type !== "book") {
      result.error = "Not an ebook (use manga enrichment for manga)";
      return result;
    }

    emitEnrichmentProgress(bookId, "openlibrary-search-started", {
      isbn: book.isbn,
      title: book.title,
    });

    // 2. Search OpenLibrary - ISBN first, then title+author
    let match: OpenLibraryBook | null = null;

    if (book.isbn) {
      match = await searchByISBN(book.isbn);
    }

    if (!match && book.title) {
      const results = await searchByTitle(book.title, book.author || undefined);
      if (results.length > 0) {
        match = selectBestMatch(results, book.title, book.author);
      }
    }

    if (!match) {
      logger.info("No OpenLibrary match found", { context, bookId });
      emitEnrichmentProgress(bookId, "openlibrary-no-match", {});
      result.error = "No matching book found on OpenLibrary";
      return result;
    }

    emitEnrichmentProgress(bookId, "openlibrary-match-found", {
      matchTitle: match.title,
      matchAuthor: match.author_name?.[0],
    });

    // 3. Map to BookMetadata
    const metadata = mapToBookMetadata(match);

    // 3b. Fetch description from Works API (not available in search endpoint)
    if (match.key) {
      const description = await fetchWorkDescription(match.key);
      if (description) {
        metadata.description = description;
      }
    }

    // 4. Download cover if available and missing or low quality
    const shouldDownloadCover =
      match.cover_i &&
      (!book.cover_path || (await isCoverLowQuality(book.cover_path)));

    if (shouldDownloadCover) {
      const coverUrl = getCoverUrl(match.cover_i);
      if (coverUrl) {
        const coverPath = await downloadCover(coverUrl, bookId);
        if (coverPath) {
          metadata.cover_path = coverPath;
          result.coverUpdated = true;
        }
      }
    }

    // 5. Determine which fields to update (only missing or improved)
    const updateData: Partial<BookMetadata> = {};

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
    if (metadata.isbn && !book.isbn) {
      updateData.isbn = metadata.isbn;
      result.fieldsUpdated.push("isbn");
    }
    if (metadata.publication_date && !book.publication_date) {
      updateData.publication_date = metadata.publication_date;
      result.fieldsUpdated.push("publication_date");
    }
    if (metadata.cover_path) {
      updateData.cover_path = metadata.cover_path;
      result.fieldsUpdated.push("cover_path");
    }

    // 6. Update book record
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
      source: "openlibrary",
      fieldsUpdated: result.fieldsUpdated,
    });

    logger.info("OpenLibrary enrichment completed", { context, result });

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("OpenLibrary enrichment failed", {
      context,
      bookId,
      error: err,
    });
    emitEnrichmentProgress(bookId, "enrichment-failed", {
      source: "openlibrary",
      error: String(err),
    });
    return result;
  }
}

/**
 * Select best match using title similarity scoring.
 */
function selectBestMatch(
  results: OpenLibraryBook[],
  targetTitle: string,
  targetAuthor?: string | null,
): OpenLibraryBook | null {
  if (results.length === 0) return null;

  const normalizedTitle = normalizeString(targetTitle);
  const normalizedAuthor = targetAuthor ? normalizeString(targetAuthor) : null;

  let bestMatch = results[0];
  let bestScore = 0;

  for (const book of results) {
    let score = 0;

    // Title similarity (0-100)
    const bookTitle = normalizeString(book.title || "");
    score += calculateSimilarity(normalizedTitle, bookTitle) * 60;

    // Author match (0-40)
    if (normalizedAuthor && book.author_name) {
      for (const author of book.author_name) {
        const authorSim = calculateSimilarity(
          normalizedAuthor,
          normalizeString(author),
        );
        score += authorSim * 40;
        break; // Only use first author
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = book;
    }
  }

  // Minimum score threshold
  if (bestScore < 50) {
    logger.warn("Best match score too low", {
      context,
      bestScore,
      bestMatch: bestMatch.title,
    });
    return null;
  }

  return bestMatch;
}

function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  // Simple Jaccard-like similarity
  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));

  const intersection = [...aChars].filter((c) => bChars.has(c)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return (intersection / union) * 100;
}
