import { logger } from "../../../utils/logger";
import { RateLimiter } from "../../../utils/rateLimiter";
import { getScrapingConfig } from "../../../config/scraping";
import { BookMetadata } from "../../../db/schema";

const context = "anilistClient";
const scrapingConfig = getScrapingConfig();

const GRAPHQL_ENDPOINT = scrapingConfig.aniList.graphqlEndpoint;
const SEARCH_TIMEOUT = scrapingConfig.aniList.searchTimeout;
const MAX_RETRIES = scrapingConfig.aniList.maxRetries;

// Rate limiter: 90 requests per minute
const rateLimiter = new RateLimiter({
  maxTokens: scrapingConfig.aniList.rateLimit,
  refillIntervalMs: scrapingConfig.aniList.rateLimitWindow,
});

// --- Interfaces ---

export interface AniListTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

export interface AniListCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface AniListFuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListStaffName {
  full: string | null;
  native: string | null;
}

export interface AniListStaffEdge {
  role: string;
  node: {
    name: AniListStaffName;
  };
}

export interface AniListMedia {
  id: number;
  title: AniListTitle;
  description: string | null;
  genres: string[];
  coverImage: AniListCoverImage | null;
  status: string | null;
  volumes: number | null;
  chapters: number | null;
  format: string | null;
  staff: {
    edges: AniListStaffEdge[];
  } | null;
  startDate: AniListFuzzyDate | null;
  synonyms: string[];
  averageScore: number | null;
}

export interface AniListSearchResponse {
  data: {
    Page: {
      pageInfo: {
        total: number;
        currentPage: number;
        hasNextPage: boolean;
      };
      media: AniListMedia[];
    };
  };
}

// --- GraphQL Query ---
const MANGA_SEARCH_QUERY = `
query SearchManga($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      hasNextPage
    }
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title {
        romaji
        english
        native
      }
      description(asHtml: false)
      genres
      coverImage {
        extraLarge
        large
        medium
        color
      }
      status
      volumes
      chapters
      format
      staff(sort: RELEVANCE, perPage: 5) {
        edges {
          role
          node {
            name {
              full
              native
            }
          }
        }
      }
      startDate {
        year
        month
        day
      }
      synonyms
      averageScore
    }
  }
}
`;

/**
 * Search AniList for manga by title.
 */
export async function searchManga(
  title: string,
  perPage = 5,
): Promise<AniListMedia[]> {
  logger.info("Searching AniList for manga", { context, title });

  await rateLimiter.acquire();

  const response = await fetchGraphQL<AniListSearchResponse>(
    MANGA_SEARCH_QUERY,
    { search: title, page: 1, perPage },
  );

  if (!response || !response.data?.Page?.media) {
    logger.info("No AniList results found", { context, title });
    return [];
  }

  return response.data.Page.media;
}

/**
 * Execute a GraphQL query against AniList API with retry.
 */
async function fetchGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  retries = MAX_RETRIES,
): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(
            response.headers.get("Retry-After") || "60",
            10,
          );
          logger.warn("AniList rate limited", { context, retryAfter, attempt });
          await sleep(retryAfter * 1000);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as T & {
        errors?: Array<{ message: string; status?: number }>;
      };

      // Check for GraphQL-level errors
      if ((json as any).errors) {
        const errors = (json as any).errors;
        const isRateLimited = errors.some((e: any) => e.status === 429);
        if (isRateLimited && attempt < retries) {
          logger.warn("AniList GraphQL rate limited", { context, attempt });
          await sleep(60 * 1000); // Wait 1 minute
          continue;
        }
        throw new Error(
          `GraphQL errors: ${errors.map((e: any) => e.message).join(", ")}`,
        );
      }
      return json;
    } catch (err) {
      logger.warn("AniList request failed", {
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

  logger.error("AniList request failed after all retries", { context });
  return null;
}

/**
 * Map AniList Media result to BookMetadata.
 */
export function mapToBookMetadata(media: AniListMedia): BookMetadata {
  // Prefer English title, fallback to romaji, then native
  const title =
    media.title.english ||
    media.title.romaji ||
    media.title.native ||
    undefined;

  // Extract author from staff edges
  const author = extractAuthor(media.staff?.edges || []);

  // Strip any remaining HTML tags from description
  const description = media.description
    ? stripHtmlTags(media.description)
    : undefined;

  // Format publication date from FuzzyDate
  const publicationDate = media.startDate
    ? formatFuzzyDate(media.startDate)
    : undefined;

  return {
    title,
    author: author || undefined,
    description,
    genres: media.genres?.slice(0, 5), // Limit to 5 genres
    publication_date: publicationDate,
  };
}

/**
 * Extract author name from staff edges.
 * Priority: "Story & Art" > "Story" > "Original Creator" > first staff
 */
export function extractAuthor(edges: AniListStaffEdge[]): string | null {
  if (!edges || edges.length === 0) return null;

  const rolePriority = ["Story & Art", "Story", "Original Creator", "Art"];

  for (const targetRole of rolePriority) {
    const match = edges.find(
      (e) => e.role.toLowerCase() === targetRole.toLowerCase(),
    );
    if (match) {
      return match.node.name.full || match.node.name.native || null;
    }
  }

  // Fallback to first staff member
  return edges[0]?.node.name.full || edges[0]?.node.name.native || null;
}

/**
 * Get best available cover URL.
 */
export function getCoverUrl(
  coverImage: AniListCoverImage | null,
): string | null {
  if (!coverImage) return null;

  // Prefer Largest image
  return coverImage.extraLarge || coverImage.large || coverImage.medium || null;
}

/**
 * Strip HTML tags from string.
 */
export function stripHtmlTags(html: string): string {
  return html
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

/**
 * Format AniList FuzzyDate to ISO-style date string.
 */
function formatFuzzyDate(date: AniListFuzzyDate): string | undefined {
  if (!date.year) return undefined;
  if (!date.month) return `${date.year}`;
  if (!date.day) return `${date.year}-${String(date.month).padStart(2, "0")}`;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
