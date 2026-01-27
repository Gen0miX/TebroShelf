import { logger } from "../../../utils/logger";
import { RateLimiter } from "../../../utils/rateLimiter";
import { getScrapingConfig } from "../../../config/scraping";
import { BookMetadata } from "../../../db/schema";

const context = "malClient";

// --- Interfaces ---

export interface MalAlternativeTitles {
  synonyms: string[];
  en: string;
  ja: string;
}

export interface MalMainPicture {
  medium: string;
  large: string;
}

export interface MalAuthor {
  node: {
    id: number;
    first_name: string;
    last_name: string;
  };
  role: string;
}

export interface MalGenre {
  id: number;
  name: string;
}

export interface MalMangaNode {
  id: number;
  title: string;
  alternative_titles: MalAlternativeTitles | null;
  synopsis: string | null;
  genres: MalGenre[];
  media_type: string;
  status: string | null;
  num_volumes: number;
  num_chapters: number;
  authors: MalAuthor[];
  main_picture: MalMainPicture | null;
  start_date: string | null;
}

export interface MalSearchResponse {
  data: Array<{ node: MalMangaNode }>;
  paging: {
    next?: string;
  };
}

// Rate limiter: 60 requests per minute (~1/sec)
const malConfig = getScrapingConfig().myAnimeList;
const rateLimiter = new RateLimiter({
  maxTokens: malConfig.rateLimit,
  refillIntervalMs: malConfig.rateLimitWindow,
});

const MANGA_FIELDS = [
  "id",
  "title",
  "alternative_titles",
  "synopsis",
  "genres",
  "media_type",
  "status",
  "num_volumes",
  "num_chapters",
  "authors",
  "main_picture",
  "start_date",
].join(",");

/**
 * Search MyAnimeList for manga by title.
 * Returns empty array if MAL_CLIENT_ID is not configured.
 */
export async function searchManga(
  title: string,
  limit = 5,
): Promise<MalMangaNode[]> {
  const config = getScrapingConfig().myAnimeList;

  if (!config.clientId) {
    logger.warn("MAL_CLIENT_ID not configured, skipping MAL search", {
      context,
    });
    return [];
  }

  logger.info("Searching MyAnimeList for manga", { context, title });

  await rateLimiter.acquire();

  const url = new URL(`${config.baseUrl}/manga`);
  url.searchParams.set("q", title);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", MANGA_FIELDS);

  const response = await fetchWithRetry(
    url.toString(),
    config.clientId,
    config.maxRetries,
  );

  if (!response || !response.data || response.data.length === 0) {
    logger.info("No MAL results found", { context, title });
    return [];
  }

  return response.data.map((item) => item.node);
}

/**
 * Fetch with retry and exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  clientId: string,
  maxRetries: number,
): Promise<MalSearchResponse | null> {
  const { searchTimeout } = getScrapingConfig().myAnimeList;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        searchTimeout,
      );

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "X-MAL-CLIENT-ID": clientId,
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get("Retry-After") || "60",
            10,
          );
          logger.warn("MAL rate limited", { context, retryAfter, attempt });
          await sleep(retryAfter * 1000);
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          logger.error("MAL authentication failed", {
            context,
            status: response.status,
          });
          return null; // Do not retry auth errors
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as MalSearchResponse;
    } catch (err) {
      logger.warn("MAL request failed", {
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

  logger.error("MAL request failed after all retries", { context });
  return null;
}

/**
 * Map MAL manga node to BookMetadata.
 */
export function mapToBookMetadata(manga: MalMangaNode): Partial<BookMetadata> {
  return {
    title: manga.title || undefined,
    author: getAuthorName(manga.authors) || undefined,
    description: manga.synopsis ? stripHtml(manga.synopsis) : undefined,
    genres: manga.genres?.map((g) => g.name).slice(0, 5),
    publication_date: manga.start_date || undefined,
  };
}

/**
 * Extract author name from MAL authors array.
 * Priority: "Story & Art" > "Story" > first author
 */
export function getAuthorName(authors: MalAuthor[]): string | null {
  if (!authors || authors.length === 0) return null;

  const rolePriority = ["Story & Art", "Story"];

  for (const targetRole of rolePriority) {
    const match = authors.find(
      (a) => a.role.toLowerCase() === targetRole.toLowerCase(),
    );
    if (match) {
      return `${match.node.first_name} ${match.node.last_name}`.trim();
    }
  }

  // Fallback to first author
  const first = authors[0];
  return `${first.node.first_name} ${first.node.last_name}`.trim() || null;
}

/**
 * Get best available cover URL.
 */
export function getCoverUrl(mainPicture: MalMainPicture | null): string | null {
  if (!mainPicture) return null;
  return mainPicture.large || mainPicture.medium || null;
}

/**
 * Strip HTML tags from string (MAL synopsis may contain some).
 */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
