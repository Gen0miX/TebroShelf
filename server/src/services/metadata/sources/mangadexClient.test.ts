import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../../utils/rateLimiter";
import * as mangadexClient from "./mangadexClient";
import type {
  MangaDexManga,
  MangaDexSearchResponse,
  MangaDexTag,
  MangaDexRelationship,
} from "./mangadexClient";

// =======================
// Mocks
// =======================

// Use vi.hoisted to allow access to config in tests
const mocks = vi.hoisted(() => ({
  mangaDexConfig: {
    baseUrl: "https://api.mangadex.org",
    coverBaseUrl: "https://uploads.mangadex.org/covers",
    userAgent: "TebroShelf/1.0",
    rateLimit: 5,
    rateLimitWindow: 1000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
}));

// Mock dependencies
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: () => ({
    mangaDex: mocks.mangaDexConfig,
  }),
}));

vi.mock("../../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock RateLimiter using class pattern
vi.mock("../../../utils/rateLimiter", () => {
  return {
    RateLimiter: class {
      constructor(_: any) {}
      acquire() {
        return Promise.resolve();
      }
    },
  };
});

describe("MangaDexClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 6.2 — Test manga search with mock REST response
  it("should search for manga and return results", async () => {
    const mockResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [
        {
          id: "a96676e5-8ae2-425e-b549-7f15dd34a6d8",
          type: "manga",
          attributes: {
            title: { en: "Berserk" },
            altTitles: [],
            description: { en: "A dark fantasy story" },
            originalLanguage: "ja",
            status: "ongoing",
            publicationDemographic: "seinen",
            contentRating: "safe",
            tags: [],
            year: 1989,
            createdAt: "2021-01-01T00:00:00Z",
            updatedAt: "2021-01-01T00:00:00Z",
          },
          relationships: [
            {
              id: "author-id",
              type: "author",
              attributes: { name: "Kentaro Miura" },
            },
          ],
        },
      ],
      limit: 5,
      offset: 0,
      total: 1,
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await mangadexClient.searchManga("Berserk");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.mangadex.org/manga"),
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Object),
      }),
    );
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("a96676e5-8ae2-425e-b549-7f15dd34a6d8");
    expect(results[0].attributes.title.en).toBe("Berserk");
  });

  // 6.3 — Test User-Agent header is included in requests
  it("should include User-Agent header in requests", async () => {
    const mockResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [],
      limit: 5,
      offset: 0,
      total: 0,
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    await mangadexClient.searchManga("Test");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "TebroShelf/1.0",
        }),
      }),
    );
  });

  // 6.4 — Test NO authentication headers are sent
  it("should NOT include authentication headers", async () => {
    const mockResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [],
      limit: 5,
      offset: 0,
      total: 0,
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    await mangadexClient.searchManga("Test");

    const fetchCall = (fetch as any).mock.calls[0];
    const headers = fetchCall[1].headers;

    expect(headers).not.toHaveProperty("Authorization");
    expect(headers).not.toHaveProperty("X-API-Key");
    expect(headers).not.toHaveProperty("X-Auth-Token");
  });

  // 6.5 — Test rate limiter enforces 5 req/sec
  it("should use rate limiter before making requests", async () => {
    const acquireSpy = vi.spyOn(RateLimiter.prototype, "acquire");

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "ok",
        response: "collection",
        data: [],
        limit: 5,
        offset: 0,
        total: 0,
      }),
    });

    await mangadexClient.searchManga("Test");

    expect(acquireSpy).toHaveBeenCalled();
  });

  // 6.6 — Test retry logic on transient failures (500, network error)
  it("should retry on network errors and eventually succeed", async () => {
    const mockSuccessResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [
        {
          id: "success-id",
          type: "manga",
          attributes: {
            title: { en: "Success" },
            altTitles: [],
            description: {},
            originalLanguage: "ja",
            status: null,
            publicationDemographic: null,
            contentRating: "safe",
            tags: [],
            year: null,
            createdAt: "2021-01-01T00:00:00Z",
            updatedAt: "2021-01-01T00:00:00Z",
          },
          relationships: [],
        },
      ],
      limit: 5,
      offset: 0,
      total: 1,
    };

    (fetch as any)
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = mangadexClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.length).toBe(1);
    expect(result[0].attributes.title.en).toBe("Success");
  });

  it("should retry on HTTP 500 errors", async () => {
    const mockSuccessResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [
        {
          id: "recovered-id",
          type: "manga",
          attributes: {
            title: { en: "Recovered" },
            altTitles: [],
            description: {},
            originalLanguage: "ja",
            status: null,
            publicationDemographic: null,
            contentRating: "safe",
            tags: [],
            year: null,
            createdAt: "2021-01-01T00:00:00Z",
            updatedAt: "2021-01-01T00:00:00Z",
          },
          relationships: [],
        },
      ],
      limit: 5,
      offset: 0,
      total: 1,
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = mangadexClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].attributes.title.en).toBe("Recovered");
  });

  // 6.7 — Test 429 handling (wait and retry)
  it("should handle 429 rate limit and retry", async () => {
    const mockSuccessResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [
        {
          id: "after-429-id",
          type: "manga",
          attributes: {
            title: { en: "After Rate Limit" },
            altTitles: [],
            description: {},
            originalLanguage: "ja",
            status: null,
            publicationDemographic: null,
            contentRating: "safe",
            tags: [],
            year: null,
            createdAt: "2021-01-01T00:00:00Z",
            updatedAt: "2021-01-01T00:00:00Z",
          },
          relationships: [],
        },
      ],
      limit: 5,
      offset: 0,
      total: 1,
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = mangadexClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].attributes.title.en).toBe("After Rate Limit");
  });

  // 6.8 — Test 403 handling (stop immediately, do not retry — DDoS protection)
  it("should stop immediately on 403 without retrying", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const result = await mangadexClient.searchManga("Test");

    // Should only call fetch once and not retry
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  // 6.9 — Test timeout handling (10s AbortController)
  it("should handle timeout using AbortController", async () => {
    (fetch as any).mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    const promise = mangadexClient.searchManga("Test");

    // Advance time to trigger all timeouts and retries
    await vi.advanceTimersByTimeAsync(50000);

    const result = await promise;
    expect(result).toEqual([]);
  });

  // 6.10 — Test parsing of localized title (prefer en, fallback to first key)
  it("should prefer English title", () => {
    const localizedString = {
      en: "English Title",
      ja: "日本語タイトル",
      fr: "Titre français",
    };

    const result = mangadexClient.getLocalizedString(localizedString);

    expect(result).toBe("English Title");
  });

  it("should fallback to first available language if English not available", () => {
    const localizedString = {
      ja: "日本語タイトル",
      fr: "Titre français",
    };

    const result = mangadexClient.getLocalizedString(localizedString);

    expect(result).toBe("日本語タイトル");
  });

  it("should return null for empty localized string", () => {
    const result = mangadexClient.getLocalizedString({});

    expect(result).toBeNull();
  });

  it("should return null for null/undefined localized string", () => {
    expect(mangadexClient.getLocalizedString(null)).toBeNull();
    expect(mangadexClient.getLocalizedString(undefined)).toBeNull();
  });

  // 6.11 — Test author extraction from relationships array (type === "author", attributes.name)
  it("should extract author name from relationships", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "artist-id",
        type: "artist",
        attributes: { name: "Artist Name" },
      },
      {
        id: "author-id",
        type: "author",
        attributes: { name: "Author Name" },
      },
    ];

    const author = mangadexClient.getAuthorName(relationships);

    expect(author).toBe("Author Name");
  });

  it("should return null if no author relationship found", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "artist-id",
        type: "artist",
        attributes: { name: "Artist Name" },
      },
    ];

    const author = mangadexClient.getAuthorName(relationships);

    expect(author).toBeNull();
  });

  it("should return null if author has no name attribute", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "author-id",
        type: "author",
        attributes: {},
      },
    ];

    const author = mangadexClient.getAuthorName(relationships);

    expect(author).toBeNull();
  });

  it("should return null for empty relationships array", () => {
    const author = mangadexClient.getAuthorName([]);

    expect(author).toBeNull();
  });

  // 6.12 — Test genre extraction from tags array (group === "genre", name.en)
  it("should extract genres from tags with group === 'genre'", () => {
    const tags: MangaDexTag[] = [
      {
        id: "tag-1",
        type: "tag",
        attributes: {
          name: { en: "Action" },
          group: "genre",
        },
      },
      {
        id: "tag-2",
        type: "tag",
        attributes: {
          name: { en: "Dark Theme" },
          group: "theme",
        },
      },
      {
        id: "tag-3",
        type: "tag",
        attributes: {
          name: { en: "Fantasy" },
          group: "genre",
        },
      },
    ];

    const genres = mangadexClient.extractGenres(tags);

    expect(genres).toEqual(["Action", "Fantasy"]);
  });

  it("should limit genres to 5", () => {
    const tags: MangaDexTag[] = Array.from({ length: 10 }, (_, i) => ({
      id: `tag-${i}`,
      type: "tag" as const,
      attributes: {
        name: { en: `Genre ${i}` },
        group: "genre",
      },
    }));

    const genres = mangadexClient.extractGenres(tags);

    expect(genres.length).toBe(5);
  });

  it("should fallback to other languages if English not available", () => {
    const tags: MangaDexTag[] = [
      {
        id: "tag-1",
        type: "tag",
        attributes: {
          name: { ja: "アクション" },
          group: "genre",
        },
      },
    ];

    const genres = mangadexClient.extractGenres(tags);

    expect(genres).toEqual(["アクション"]);
  });

  it("should return empty array for empty tags", () => {
    const genres = mangadexClient.extractGenres([]);

    expect(genres).toEqual([]);
  });

  // 6.13 — Test cover fileName extraction from cover_art relationship
  it("should extract cover fileName from relationships", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "cover-id",
        type: "cover_art",
        attributes: { fileName: "cover-image.jpg" },
      },
    ];

    const fileName = mangadexClient.getCoverFileName(relationships);

    expect(fileName).toBe("cover-image.jpg");
  });

  it("should return null if no cover_art relationship found", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "author-id",
        type: "author",
        attributes: { name: "Author Name" },
      },
    ];

    const fileName = mangadexClient.getCoverFileName(relationships);

    expect(fileName).toBeNull();
  });

  it("should return null if cover_art has no fileName attribute", () => {
    const relationships: MangaDexRelationship[] = [
      {
        id: "cover-id",
        type: "cover_art",
        attributes: {},
      },
    ];

    const fileName = mangadexClient.getCoverFileName(relationships);

    expect(fileName).toBeNull();
  });

  // 6.14 — Test cover URL construction: https://uploads.mangadex.org/covers/{mangaId}/{fileName}
  it("should construct correct cover URL", () => {
    const mangaId = "a96676e5-8ae2-425e-b549-7f15dd34a6d8";
    const fileName = "cover-image.jpg";

    const url = mangadexClient.buildCoverUrl(mangaId, fileName);

    expect(url).toBe(
      "https://uploads.mangadex.org/covers/a96676e5-8ae2-425e-b549-7f15dd34a6d8/cover-image.jpg",
    );
  });

  // 6.15 — Test empty results handling (data: [])
  it("should return empty array when no results found", async () => {
    const mockResponse: MangaDexSearchResponse = {
      result: "ok",
      response: "collection",
      data: [],
      limit: 5,
      offset: 0,
      total: 0,
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await mangadexClient.searchManga("NonexistentManga");

    expect(results).toEqual([]);
  });

  it("should return empty array when response is null", async () => {
    vi.useRealTimers();

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const results = await mangadexClient.searchManga("Test");

    expect(results).toEqual([]);

    vi.useFakeTimers();
  });

  it("should return empty array when data is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "ok",
        response: "collection",
        limit: 5,
        offset: 0,
        total: 0,
      }),
    });

    const results = await mangadexClient.searchManga("Test");

    expect(results).toEqual([]);
  });

  // 6.16 — Test localized description extraction (prefer en)
  it("should extract localized description preferring English", () => {
    const manga: MangaDexManga = {
      id: "test-id",
      type: "manga",
      attributes: {
        title: { en: "Test Manga" },
        altTitles: [],
        description: {
          en: "English description",
          ja: "日本語の説明",
        },
        originalLanguage: "ja",
        status: "ongoing",
        publicationDemographic: null,
        contentRating: "safe",
        tags: [],
        year: 2020,
        createdAt: "2021-01-01T00:00:00Z",
        updatedAt: "2021-01-01T00:00:00Z",
      },
      relationships: [],
    };

    const metadata = mangadexClient.mapToBookMetadata(manga);

    expect(metadata.description).toBe("English description");
  });

  it("should map complete manga data to BookMetadata", () => {
    const manga: MangaDexManga = {
      id: "test-id",
      type: "manga",
      attributes: {
        title: { en: "One Piece" },
        altTitles: [],
        description: { en: "A story about pirates" },
        originalLanguage: "ja",
        status: "ongoing",
        publicationDemographic: "shounen",
        contentRating: "safe",
        tags: [
          {
            id: "tag-1",
            type: "tag",
            attributes: {
              name: { en: "Action" },
              group: "genre",
            },
          },
          {
            id: "tag-2",
            type: "tag",
            attributes: {
              name: { en: "Adventure" },
              group: "genre",
            },
          },
        ],
        year: 1997,
        createdAt: "2021-01-01T00:00:00Z",
        updatedAt: "2021-01-01T00:00:00Z",
      },
      relationships: [
        {
          id: "author-id",
          type: "author",
          attributes: { name: "Eiichiro Oda" },
        },
      ],
    };

    const metadata = mangadexClient.mapToBookMetadata(manga);

    expect(metadata.title).toBe("One Piece");
    expect(metadata.author).toBe("Eiichiro Oda");
    expect(metadata.description).toBe("A story about pirates");
    expect(metadata.genres).toEqual(["Action", "Adventure"]);
    expect(metadata.publication_date).toBe("1997");
    expect(metadata.publication_status).toBe("ongoing");
  });
});
