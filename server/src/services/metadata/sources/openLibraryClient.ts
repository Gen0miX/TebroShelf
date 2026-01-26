import { logger } from "../../../utils/logger";
import { RateLimiter } from "../../../utils/rateLimiter";
import { BookMetadata } from "../../../db/schema";
import { SCRAPING_CONFIG } from "../../../config/scraping";

const context = "openLibraryClient";

const API_BASE_URL = SCRAPING_CONFIG.API_BASE_URL;
const COVERS_BASE_URL = SCRAPING_CONFIG.COVERS_BASE_URL;
const SEARCH_TIMEOUT = SCRAPING_CONFIG.SEARCH_TIMEOUT; // 10 seconds
const MAX_RETRIES = SCRAPING_CONFIG.MAX_RETRIES;

// Rate limiter: 100 requests per 5 minutes
const rateLimiter = new RateLimiter({
  maxTokens: SCRAPING_CONFIG.RATE_LIMIT,
  refillIntervalMs: 5 * 60 * 1000, // 5 minutes
});

export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  isbn?: string[];
  publisher?: string[];
  number_of_pages_median?: number;
  language?: string[];
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  docs: OpenLibraryBook[];
}

/**
 * Search OpenLibrary by ISBN (most accurate).
 */
export async function searchByISBN(
  isbn: string,
): Promise<OpenLibraryBook | null> {
  logger.info("Searching OpenLibrary by ISBN", { context, isbn });

  await rateLimiter.acquire();

  const url = `${API_BASE_URL}/search.json?isbn=${isbn}&fields=key,title,author_name,author_key,first_publish_year,cover_i,subject,isbn,publisher&limit=1`;

  const response = await fetchWithRetry(url);

  if (!response || response.numFound === 0) {
    logger.info("No results found for ISBN", { context, isbn });
    return null;
  }

  return response.docs[0];
}

/**
 * Search OpenLibrary by title and optionally author.
 */
export async function searchByTitle(
  title: string,
  author?: string,
): Promise<OpenLibraryBook[]> {
  logger.info("Searching OpenLibrary by title", { context, title, author });

  await rateLimiter.acquire();

  let query = `title=${encodeURIComponent(title)}`;
  if (author) {
    query += `&author=${encodeURIComponent(author)}`;
  }

  const url = `${API_BASE_URL}/search.json?${query}&fields=key,title,author_name,author_key,first_publish_year,cover_i,subject,isbn,publisher&limit=5`;

  const response = await fetchWithRetry(url);

  if (!response || response.numFound === 0) {
    logger.info("No results found for title", { context, title, author });
    return [];
  }

  return response.docs;
}

/**
 * Fetch with retry and timeout
 */
async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<OpenLibrarySearchResponse | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TebroShelf/1.0 (https://github.com/tebroshelf)",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as OpenLibrarySearchResponse;
    } catch (err) {
      logger.warn("OpenLibrary request failed", {
        context,
        attempt,
        maxRetries: retries,
        error: err,
      });

      if (attempt < retries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await sleep(delay);
      }
    }
  }
  logger.error("OpenLibrary request failed after all retries", {
    context,
    url,
  });
  return null;
}

/**
 * Map OpenLibrary result to BookMetadata.
 */
export function mapToBookMetadata(book: OpenLibraryBook): BookMetadata {
  return {
    title: book.title || undefined,
    author: book.author_name?.join(", ") || undefined,
    genres: book.subject?.slice(0, 5), // Limit to 5 genres
    publication_date: book.first_publish_year
      ? `${book.first_publish_year}-01-01`
      : undefined,
    isbn: book.isbn?.[0] || undefined,
  };
}

/**
 * Get cover URL for downloading.
 */
export function getCoverUrl(
  coverId: number | undefined,
  isbn?: string,
  size: "S" | "M" | "L" = "L",
): string | null {
  if (coverId) {
    return `${COVERS_BASE_URL}/b/id/${coverId}-${size}.jpg?default=false`;
  }
  if (isbn) {
    return `${COVERS_BASE_URL}/b/isbn/${isbn}-${size}.jpg?default=false`;
  }
  return null;
}

/**
 * Fetch description from OpenLibrary Works API.
 * The search endpoint does not return descriptions; requires a separate call.
 */
export async function fetchWorkDescription(
  workKey: string,
): Promise<string | null> {
  logger.info("Fetching work description", { context, workKey });

  await rateLimiter.acquire();

  const url = `${API_BASE_URL}${workKey}.json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TebroShelf/1.0 (https://github.com/tebroshelf)",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn("Works API returned non-OK status", {
        context,
        workKey,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Description can be a string or { type: string, value: string }
    const desc = data.description;
    if (typeof desc === "string") return desc;
    if (desc && typeof desc === "object" && "value" in desc) {
      return (desc as { value: string }).value;
    }

    return null;
  } catch (err) {
    logger.warn("Failed to fetch work description", {
      context,
      workKey,
      error: err,
    });
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
