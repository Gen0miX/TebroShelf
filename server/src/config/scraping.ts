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
  aniList: {
    graphqlEndpoint: string;
    rateLimit: number;
    rateLimitWindow: number;
    searchTimeout: number;
    maxRetries: number;
  };
  myAnimeList: {
    clientId: string;
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
    searchTimeout: number;
    maxRetries: number;
  };
  mangaDex: {
    baseUrl: string;
    coverBaseUrl: string;
    userAgent: string;
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
    aniList: {
      graphqlEndpoint:
        process.env.ANILIST_GRAPHQL_ENDPOINT || "https://graphql.anilist.co",
      rateLimit: parseInt(process.env.ANILIST_RATE_LIMIT || "90", 10),
      rateLimitWindow: 60 * 1000, // 1 minute
      searchTimeout: parseInt(
        process.env.ANILIST_SEARCH_TIMEOUT || "10000",
        10,
      ),
      maxRetries: parseInt(process.env.ANILIST_MAX_RETRIES || "3", 10),
    },
    myAnimeList: {
      clientId: process.env.MAL_CLIENT_ID || "",
      baseUrl: process.env.MAL_BASE_URL || "https://api.myanimelist.net/v2",
      rateLimit: parseInt(process.env.MAL_RATE_LIMIT || "60", 10),
      rateLimitWindow: 60 * 1000, // 1 minute
      searchTimeout: parseInt(process.env.MAL_SEARCH_TIMEOUT || "10000", 10),
      maxRetries: parseInt(process.env.MAL_MAX_RETRIES || "3", 10),
    },
    mangaDex: {
      baseUrl: process.env.MANGADEX_BASE_URL || "https://api.mangadex.org",
      coverBaseUrl:
        process.env.MANGADEX_COVER_URL || "https://uploads.mangadex.org/covers",
      userAgent: process.env.MANGADEX_USER_AGENT || "TebroShelf/1.0",
      rateLimit: parseInt(process.env.MANGADEX_RATE_LIMIT || "5", 10),
      rateLimitWindow: 1000, // 1 second
      searchTimeout: parseInt(
        process.env.MANGADEX_SEARCH_TIMEOUT || "10000",
        10,
      ),
      maxRetries: parseInt(process.env.MANGADEX_MAX_RETRIES || "3", 10),
    },
  };
}
