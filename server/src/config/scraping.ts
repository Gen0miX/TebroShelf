/**
 * Configuration for external scraping / API calls (OpenLibrary, Google Books)
 * Values can be overridden via environment variables.
 */

export interface ScrapingConfig {
  openLibrary: {
    apiBaseUrl: string;
    coversBaseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
    searchTimeout: number;
    maxRetries: number;
  };
  googleBooks: {
    apiBaseUrl: string;
    apiKey: string | undefined;
    rateLimit: number;
    rateLimitWindow: number;
    searchTimeout: number;
    maxRetries: number;
  };
}

export function getScrapingConfig(): ScrapingConfig {
  return {
    openLibrary: {
      apiBaseUrl: process.env.OPENLIBRARY_API_URL || "https://openlibrary.org",
      coversBaseUrl:
        process.env.OPENLIBRARY_COVERS_URL || "https://covers.openlibrary.org",
      rateLimit: parseInt(process.env.OPENLIBRARY_RATE_LIMIT || "100", 10),
      rateLimitWindow: 5 * 60 * 1000, // 5 minutes
      searchTimeout: parseInt(
        process.env.OPENLIBRARY_SEARCH_TIMEOUT || "10000",
        10,
      ),
      maxRetries: parseInt(process.env.OPENLIBRARY_MAX_RETRIES || "3", 10),
    },
    googleBooks: {
      apiBaseUrl:
        process.env.GOOGLE_BOOKS_API_URL ||
        "https://www.googleapis.com/books/v1",
      apiKey: process.env.GOOGLE_BOOKS_API_KEY,
      rateLimit: parseInt(process.env.GOOGLE_BOOKS_RATE_LIMIT || "100", 10),
      rateLimitWindow: 60 * 1000, // 1 minute
      searchTimeout: parseInt(
        process.env.GOOGLE_BOOKS_SEARCH_TIMEOUT || "10000",
        10,
      ),
      maxRetries: parseInt(process.env.GOOGLE_BOOKS_MAX_RETRIES || "3", 10),
    },
  };
}
