// server/src/services/metadata/sources/mangadexClient.ts
import { logger } from "../../../utils/logger";
import { RateLimiter } from "../../../utils/rateLimiter";
import { getScrapingConfig } from "../../../config/scraping";
import { BookMetadata } from "../../../db/schema";

const context = "mangadexClient";

// --- Interfaces ---

export interface MangaDexLocalizedString {
  [lang: string]: string;
}

export interface MangaDexTag {
  id: string;
  type: "tag";
  attributes: {
    name: MangaDexLocalizedString;
    group: string; // "genre", "theme", "format", "content"
  };
}

export interface MangaDexMangaAttributes {
  title: MangaDexLocalizedString;
  altTitles: MangaDexLocalizedString[];
  description: MangaDexLocalizedString;
  originalLanguage: string;
  status: string | null; // "ongoing", "completed", "hiatus", "cancelled"
  publicationDemographic: string | null;
  contentRating: string;
  tags: MangaDexTag[];
  year: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MangaDexRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MangaDexManga {
  id: string;
  type: "manga";
  attributes: MangaDexMangaAttributes;
  relationships: MangaDexRelationship[];
}

export interface MangaDexSearchResponse {
  result: "ok" | "error";
  response: "collection";
  data: MangaDexManga[];
  limit: number;
  offset: number;
  total: number;
}

// Rate limiter: 5 requests per second
const rateLimiter = new RateLimiter({
  maxTokens: 5,
  refillIntervalMs: 1000,
});

/**
 * Search MangaDex for manga by title.
 * Uses reference expansion to include author, artist, and cover_art.
 */
export async function searchManga(
  title: string,
  limit = 5,
): Promise<MangaDexManga[]> {
  const config = getScrapingConfig().mangaDex;

  logger.info("Searching MangaDex for manga", { context, title });

  await rateLimiter.acquire();

  const url = new URL(`${config.baseUrl}/manga`);
  url.searchParams.set("title", title);
  url.searchParams.set("limit", String(limit));
  url.searchParams.append("includes[]", "author");
  url.searchParams.append("includes[]", "artist");
  url.searchParams.append("includes[]", "cover_art");
  url.searchParams.append("contentRating[]", "safe");
  url.searchParams.append("contentRating[]", "suggestive");
  url.searchParams.append("contentRating[]", "erotica");
  url.searchParams.set("order[relevance]", "desc");

  const response = await fetchWithRetry(url.toString(), config.maxRetries);

  if (!response || !response.data || response.data.length === 0) {
    logger.info("No MangaDex results found", { context, title });
    return [];
  }

  return response.data;
}

/**
 * Fetch with retry and exponential backoff.
 * CRITICAL: Stop immediately on 403 (DDoS protection IP ban).
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number,
): Promise<MangaDexSearchResponse | null> {
  const config = getScrapingConfig().mangaDex;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.searchTimeout,
      );

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": config.userAgent,
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 403) {
          logger.error("MangaDex 403 — DDoS protection triggered, stopping", {
            context,
          });
          return null; // NEVER retry 403
        }
        if (response.status === 429) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s exponential backoff
          logger.warn("MangaDex rate limited", { context, attempt, retryInMs: delay });
          await sleep(delay);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as MangaDexSearchResponse;
    } catch (err) {
      logger.warn("MangaDex request failed", {
        context,
        attempt,
        maxRetries,
        error: err,
      });

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await sleep(delay);
      }
    }
  }

  logger.error("MangaDex request failed after all retries", { context });
  return null;
}

// --- Mappers ---

/**
 * Extract localized string, preferring English.
 */
export function getLocalizedString(
  obj: MangaDexLocalizedString | null | undefined,
  preferLang = "en",
): string | null {
  if (!obj) return null;
  if (obj[preferLang]) return obj[preferLang];
  // Fallback to first available language
  const keys = Object.keys(obj);
  return keys.length > 0 ? obj[keys[0]] : null;
}

/**
 * Extract author name from relationships array.
 */
export function getAuthorName(
  relationships: MangaDexRelationship[],
): string | null {
  const author = relationships.find((r) => r.type === "author");
  if (!author?.attributes?.name) return null;
  return String(author.attributes.name);
}

/**
 * Extract cover fileName from cover_art relationship.
 */
export function getCoverFileName(
  relationships: MangaDexRelationship[],
): string | null {
  const cover = relationships.find((r) => r.type === "cover_art");
  if (!cover?.attributes?.fileName) return null;
  return String(cover.attributes.fileName);
}

/**
 * Build full cover image URL.
 */
export function buildCoverUrl(mangaId: string, fileName: string): string {
  const config = getScrapingConfig().mangaDex;
  return `${config.coverBaseUrl}/${mangaId}/${fileName}`;
}

/**
 * Extract genres from tags (only tags with group === "genre").
 */
export function extractGenres(tags: MangaDexTag[]): string[] {
  return tags
    .filter((t) => t.attributes.group === "genre")
    .map((t) => getLocalizedString(t.attributes.name) || "")
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Map MangaDex manga to BookMetadata.
 */
export function mapToBookMetadata(manga: MangaDexManga): Partial<BookMetadata> {
  return {
    title: getLocalizedString(manga.attributes.title) || undefined,
    author: getAuthorName(manga.relationships) || undefined,
    description: getLocalizedString(manga.attributes.description) || undefined,
    genres: extractGenres(manga.attributes.tags),
    publication_date: manga.attributes.year
      ? String(manga.attributes.year)
      : undefined,
    publication_status: manga.attributes.status || undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
