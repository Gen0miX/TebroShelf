import { getBookById, updateBook } from "../../library/bookService";
import {
  searchByISBN,
  searchByTitle,
  mapToBookMetadata,
  getCoverUrl,
  isConfigured,
  GoogleBooksVolume,
} from "../sources/googleBooksClient";
import {
  emitEnrichmentProgress,
  emitEnrichmentCompleted,
} from "../../../websocket/event";
import { downloadCover } from "../coverDownloader";
import { logger } from "../../../utils/logger";
import { EnrichmentResult } from "./openLibraryEnrichment";

const context = "googleBooksEnrichment";

/**
 * Enrich book metadata from Google Books.
 */
export async function enrichFromGoogleBooks(
  bookId: number,
): Promise<EnrichmentResult> {
  logger.info("Starting Google Books enrichment", { context, bookId });

  const result: EnrichmentResult = {
    success: false,
    source: "googlebooks",
    bookId,
    fieldsUpdated: [],
    coverUpdated: false,
  };

  // Check if API is configured
  if (!isConfigured()) {
    result.error = "Google Books API key not configured";
    logger.warn(result.error, { context });
    return result;
  }

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

    emitEnrichmentProgress(bookId, "googlebooks-search-started", {
      isbn: book.isbn,
      title: book.title,
    });

    // 2. Search Google Books - ISBN first, then title+author
    let match: GoogleBooksVolume | null = null;

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
      logger.info("No Google Books match found", { context, bookId });
      emitEnrichmentProgress(bookId, "googlebooks-no-match", {});
      result.error = "No matching book found on Google Books";
      return result;
    }

    emitEnrichmentProgress(bookId, "googlebooks-match-found", {
      matchTitle: match.volumeInfo.title,
      matchAuthor: match.volumeInfo.authors?.[0],
    });

    // 3. Map to BookMetadata
    const metadata = mapToBookMetadata(match);

    // 4. Download cover if available and not already present
    if (match.volumeInfo.imageLinks && !book.cover_path) {
      const coverUrl = getCoverUrl(match.volumeInfo.imageLinks);
      if (coverUrl) {
        const coverPath = await downloadCover(coverUrl, bookId);
        if (coverPath) {
          metadata.cover_path = coverPath;
          result.coverUpdated = true;
        }
      }
    }

    // 5. Determine which fields to update (only missing or improved)
    const updateData: Partial<typeof metadata> = {};

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
    const hasGenres =
      book.genres &&
      (Array.isArray(book.genres)
        ? book.genres.length > 0
        : book.genres !== "[]");
    if (metadata.genres && !hasGenres) {
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
    if (metadata.publisher && !book.publisher) {
      updateData.publisher = metadata.publisher;
      result.fieldsUpdated.push("publisher");
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
      source: "googlebooks",
      fieldsUpdated: result.fieldsUpdated,
    });

    logger.info("Google Books enrichment completed", { context, result });

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("Google Books enrichment failed", {
      context,
      bookId,
      error: err,
    });
    emitEnrichmentProgress(bookId, "enrichment-failed", {
      source: "googlebooks",
      error: String(err),
    });
    return result;
  }
}

/**
 * Select best match using title similarity scoring.
 */
function selectBestMatch(
  results: GoogleBooksVolume[],
  targetTitle: string,
  targetAuthor?: string | null,
): GoogleBooksVolume | null {
  if (results.length === 0) return null;

  const normalizedTitle = normalizeString(targetTitle);
  const normalizedAuthor = targetAuthor ? normalizeString(targetAuthor) : null;

  let bestMatch = results[0];
  let bestScore = 0;

  for (const volume of results) {
    const info = volume.volumeInfo;
    let score = 0;

    // Title similarity (0-100)
    const volumeTitle = normalizeString(info.title || "");
    score += calculateSimilarity(normalizedTitle, volumeTitle) * 60;

    // Author match (0-40)
    if (normalizedAuthor && info.authors) {
      for (const author of info.authors) {
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
      bestMatch = volume;
    }
  }

  // Minimum score threshold
  if (bestScore < 50) {
    logger.warn("Best match score too low", {
      context,
      bestScore,
      bestMatch: bestMatch.volumeInfo.title,
    });
    return null;
  }

  return bestMatch;
}

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  // Word-based Jaccard similarity (preserves word order semantics)
  const aWords = new Set(a.split(" ").filter(Boolean));
  const bWords = new Set(b.split(" ").filter(Boolean));

  if (aWords.size === 0 && bWords.size === 0) return 100;
  if (aWords.size === 0 || bWords.size === 0) return 0;

  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;

  return (intersection / union) * 100;
}
