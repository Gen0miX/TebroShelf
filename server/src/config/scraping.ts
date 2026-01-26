/**
 * Configuration for external scraping / API calls (OpenLibrary)
 * Values can be overridden via environment variables.
 */

function getEnvString(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SCRAPING_CONFIG = {
  // --- OpenLibrary endpoints ---
  API_BASE_URL: getEnvString(
    "OPENLIBRARY_API_BASE_URL",
    "https://openlibrary.org",
  ),

  COVERS_BASE_URL: getEnvString(
    "OPENLIBRARY_COVERS_BASE_URL",
    "https://covers.openlibrary.org",
  ),

  // --- Rate limiting ---
  // Requests per 5 minutes allowed toward the API
  RATE_LIMIT: getEnvNumber("OPENLIBRARY_RATE_LIMIT", 100),

  // --- Request behavior ---
  // Timeout in milliseconds for search requests
  SEARCH_TIMEOUT: getEnvNumber("OPENLIBRARY_SEARCH_TIMEOUT", 10000),

  // Maximum retry attempts on failure
  MAX_RETRIES: getEnvNumber("OPENLIBRARY_MAX_RETRIES", 3),
} as const;

export type ScrapingConfig = typeof SCRAPING_CONFIG;
