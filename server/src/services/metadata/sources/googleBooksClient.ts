import { logger } from "../../../utils/logger";
import { RateLimiter } from "../../../utils/rateLimiter";
import { BookMetadata } from "../../../db/schema";
import { getScrapingConfig } from "../../../config/scraping";

const context = "googleBooksClient";
const scrapingConfig = getScrapingConfig();

const API_BASE_URL = scrapingConfig.googleBooks.apiBaseUrl;
const SEARCH_TIMEOUT = scrapingConfig.googleBooks.searchTimeout;
const MAX_RETRIES = scrapingConfig.googleBooks.maxRetries;

// Rate limiter : 100 requests per minutes
const rateLimiter = new RateLimiter({
  maxTokens: scrapingConfig.googleBooks.rateLimit,
  refillIntervalMs: scrapingConfig.googleBooks.rateLimitWindow,
});

export interface GoogleBooksImageLinks {
  smallThumbnail?: string;
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  extraLarge?: string;
}

export interface GoogleBooksVolumeInfo {
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  categories?: string[];
  imageLinks?: GoogleBooksImageLinks;
  language?: string;
  pageCount?: number;
}

export interface GoogleBooksVolume {
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
}

export interface GoogleBooksSearchResponse {
  kind: string;
  totalItems: number;
  items?: GoogleBooksVolume[];
}

/**
 * Get API key from environment.
 */
function getApiKey(): string {
  if (!scrapingConfig.googleBooks.apiKey) {
    throw new Error("GOOGLE_BOOKS_API_KEY environment variable is not set");
  }
  return scrapingConfig.googleBooks.apiKey;
}

/**
 * Search Google Books with a free-form query.
 */
export async function searchBooks(
  query: string,
  maxResults = 5,
): Promise<GoogleBooksVolume[]> {
  logger.info("Searching Google Books", { context, query });

  await rateLimiter.acquire();

  const apiKey = getApiKey();
  const url = `${API_BASE_URL}/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=${maxResults}&printType=books`;

  const response = await fetchWithRetry(url);

  if (!response || response.totalItems === 0 || !response.items) {
    logger.info("No results found", { context, query });
    return [];
  }

  return response.items;
}

/**
 * Search Google Books by ISBN (most accurate).
 */
export async function searchByISBN(
  isbn: string,
): Promise<GoogleBooksVolume | null> {
  logger.info("Searching Google Books by ISBN", { context, isbn });

  await rateLimiter.acquire();

  const apiKey = getApiKey();
  const query = `isbn:${isbn}`;
  const url = `${API_BASE_URL}/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=1&printType=books`;

  const response = await fetchWithRetry(url);

  if (!response || response.totalItems === 0 || !response.items) {
    logger.info("No results found for ISBN", { context, isbn });
    return null;
  }

  return response.items[0];
}

/**
 * Search Google Books by title and optionally author.
 */
export async function searchByTitle(
  title: string,
  author?: string,
): Promise<GoogleBooksVolume[]> {
  logger.info("Searching Google Books by title", { context, title, author });

  await rateLimiter.acquire();

  const apiKey = getApiKey();

  let query = `intitle:${sanitizeQueryTerm(title)}`;
  if (author) {
    query += `+inauthor:${sanitizeQueryTerm(author)}`;
  }

  const url = `${API_BASE_URL}/volumes?q=${encodeURIComponent(query)}&key=${apiKey}&maxResults=5&printType=books`;

  const response = await fetchWithRetry(url);

  if (!response || response.totalItems === 0 || !response.items) {
    logger.info("No results found for title", { context, title, author });
    return [];
  }

  return response.items;
}

/**
 * Fetch with retry and timeout.
 */
async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<GoogleBooksSearchResponse | null> {
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
        // Handle specific Google Books API errors
        if (response.status === 403) {
          throw new Error("API key invalid or quota exceeded");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as GoogleBooksSearchResponse;
    } catch (err) {
      logger.warn("Google Books request failed", {
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

  logger.error("Google Books request failed after all retries", {
    context,
    url: url.replace(/key=[^&]+/, "key=***"),
  });
  return null;
}

/**
 * Map Google Books result to BookMetadata.
 */
export function mapToBookMetadata(
  volume: GoogleBooksVolume,
): Partial<BookMetadata> {
  const info = volume.volumeInfo;

  // Extract ISBN-13 or ISBN-10
  let isbn: string | undefined;
  if (info.industryIdentifiers) {
    const isbn13 = info.industryIdentifiers.find((id) => id.type === "ISBN_13");
    const isbn10 = info.industryIdentifiers.find((id) => id.type === "ISBN_10");
    isbn = isbn13?.identifier || isbn10?.identifier;
  }

  return {
    title: info.title || undefined,
    author: info.authors?.join(", ") || undefined,
    description: info.description || undefined,
    genres: info.categories?.slice(0, 5), // Limit to 5 genres
    publication_date: info.publishedDate || undefined,
    publisher: info.publisher || undefined,
    isbn: isbn,
  };
}

/**
 * Get best available cover URL.
 */
export function getCoverUrl(
  imageLinks: GoogleBooksImageLinks | undefined,
): string | null {
  if (!imageLinks) return null;

  // Prefer larger images
  const url =
    imageLinks.extraLarge ||
    imageLinks.large ||
    imageLinks.medium ||
    imageLinks.thumbnail ||
    imageLinks.smallThumbnail;

  if (!url) return null;

  // Convert to HTTPS and optimize URL
  return url
    .replace(/^http:\/\//, "https://")
    .replace(/&edge=curl/g, "") // Remove edge effect
    .replace(/zoom=\d/, "zoom=1"); // Use full size
}

/**
 * Check if API key is configured.
 */
export function isConfigured(): boolean {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize query term to avoid breaking Google Books query syntax.
 */
function sanitizeQueryTerm(term: string): string {
  return term.replace(/[+:]/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
