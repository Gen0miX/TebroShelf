import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../../utils/rateLimiter";
import * as anilistClient from "./anilistClient";
import type {
  AniListMedia,
  AniListStaffEdge,
  AniListCoverImage,
  AniListSearchResponse,
} from "./anilistClient";

// =======================
// Mocks
// =======================

// Use vi.hoisted to allow access to config in tests
const mocks = vi.hoisted(() => ({
  aniListConfig: {
    graphqlEndpoint: "https://graphql.anilist.co",
    rateLimit: 90,
    rateLimitWindow: 60000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
}));

// Mock dependencies
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: () => ({
    aniList: mocks.aniListConfig,
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

describe("AniListClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 7.2 — Test manga search with mock GraphQL response
  it("should search for manga and return results", async () => {
    const mockResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: {
            total: 1,
            currentPage: 1,
            hasNextPage: false,
          },
          media: [
            {
              id: 30013,
              title: {
                romaji: "Berserk",
                english: "Berserk",
                native: "ベルセルク",
              },
              description: "Test description",
              genres: ["Action", "Adventure"],
              coverImage: {
                extraLarge: "https://example.com/cover-xl.jpg",
                large: "https://example.com/cover-l.jpg",
                medium: "https://example.com/cover-m.jpg",
                color: "#000000",
              },
              status: "RELEASING",
              volumes: null,
              chapters: null,
              format: "MANGA",
              staff: {
                edges: [
                  {
                    role: "Story & Art",
                    node: {
                      name: {
                        full: "Kentarou Miura",
                        native: "三浦建太郎",
                      },
                    },
                  },
                ],
              },
              startDate: {
                year: 1989,
                month: 8,
                day: 25,
              },
              synonyms: [],
              averageScore: 93,
            },
          ],
        },
      },
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await anilistClient.searchManga("Berserk");

    expect(fetch).toHaveBeenCalledWith(
      "https://graphql.anilist.co",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Object),
        body: expect.stringContaining("SearchManga"),
      }),
    );
    expect(results.length).toBe(1);
    expect(results[0].title.romaji).toBe("Berserk");
  });

  // 7.3 — Test rate limiter enforces 90 req/min
  it("should use rate limiter before making requests", async () => {
    const acquireSpy = vi.spyOn(RateLimiter.prototype, "acquire");

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { Page: { pageInfo: { total: 0 }, media: [] } },
      }),
    });

    await anilistClient.searchManga("Test");

    expect(acquireSpy).toHaveBeenCalled();
  });

  // 7.4 — Test retry logic on transient failures (500, network error)
  it("should retry on network errors and eventually succeed", async () => {
    const mockSuccessResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: { total: 1, currentPage: 1, hasNextPage: false },
          media: [
            {
              id: 1,
              title: { romaji: "Success", english: null, native: null },
              description: null,
              genres: [],
              coverImage: null,
              status: null,
              volumes: null,
              chapters: null,
              format: null,
              staff: null,
              startDate: null,
              synonyms: [],
              averageScore: null,
            },
          ],
        },
      },
    };

    (fetch as any)
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = anilistClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.length).toBe(1);
    expect(result[0].title.romaji).toBe("Success");
  });

  it("should retry on HTTP 500 errors", async () => {
    const mockSuccessResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: { total: 1, currentPage: 1, hasNextPage: false },
          media: [
            {
              id: 2,
              title: { romaji: "Recovered", english: null, native: null },
              description: null,
              genres: [],
              coverImage: null,
              status: null,
              volumes: null,
              chapters: null,
              format: null,
              staff: null,
              startDate: null,
              synonyms: [],
              averageScore: null,
            },
          ],
        },
      },
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

    const promise = anilistClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].title.romaji).toBe("Recovered");
  });

  // 7.5 — Test timeout handling (10s AbortController)
  it("should handle timeout using AbortController", async () => {
    (fetch as any).mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    const promise = anilistClient.searchManga("Test");

    // Advance time to trigger all timeouts and retries
    await vi.advanceTimersByTimeAsync(50000);

    const result = await promise;
    expect(result).toEqual([]);
  });

  // 7.6 — Test parsing of AniList Media object to BookMetadata
  it("should correctly map AniList Media to BookMetadata", () => {
    const media: AniListMedia = {
      id: 100,
      title: {
        romaji: "One Piece",
        english: "One Piece",
        native: "ワンピース",
      },
      description: "A story about pirates",
      genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Shounen"],
      coverImage: {
        extraLarge: "https://example.com/xl.jpg",
        large: "https://example.com/l.jpg",
        medium: "https://example.com/m.jpg",
        color: "#ff0000",
      },
      status: "RELEASING",
      volumes: null,
      chapters: null,
      format: "MANGA",
      staff: {
        edges: [
          {
            role: "Story & Art",
            node: {
              name: {
                full: "Eiichiro Oda",
                native: "尾田栄一郎",
              },
            },
          },
        ],
      },
      startDate: {
        year: 1997,
        month: 7,
        day: 22,
      },
      synonyms: [],
      averageScore: 90,
    };

    const metadata = anilistClient.mapToBookMetadata(media);

    expect(metadata.title).toBe("One Piece");
    expect(metadata.author).toBe("Eiichiro Oda");
    expect(metadata.description).toBe("A story about pirates");
    expect(metadata.genres).toEqual([
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Fantasy",
    ]);
    expect(metadata.publication_date).toBe("1997-07-22");
  });

  // 7.7 — Test HTML tag stripping from description
  it("should strip HTML tags from description", () => {
    const htmlDescription =
      "<p>This is a <strong>test</strong> description.</p><br/>With line breaks.";

    const stripped = anilistClient.stripHtmlTags(htmlDescription);

    expect(stripped).not.toContain("<p>");
    expect(stripped).not.toContain("<strong>");
    expect(stripped).not.toContain("<br/>");
    expect(stripped).toContain("This is a test description");
  });

  it("should decode HTML entities", () => {
    const htmlWithEntities =
      "Test &amp; description with &lt;special&gt; &quot;characters&quot;";

    const stripped = anilistClient.stripHtmlTags(htmlWithEntities);

    expect(stripped).toBe('Test & description with <special> "characters"');
  });

  it("should convert br tags to newlines", () => {
    const htmlWithBr = "Line 1<br>Line 2<br/>Line 3";

    const stripped = anilistClient.stripHtmlTags(htmlWithBr);

    expect(stripped).toContain("\n");
    expect(stripped.split("\n").length).toBeGreaterThan(1);
  });

  // 7.8 — Test author extraction from staff edges
  it("should extract author from staff edges with priority", () => {
    const edges: AniListStaffEdge[] = [
      {
        role: "Art",
        node: { name: { full: "Artist Name", native: null } },
      },
      {
        role: "Story & Art",
        node: { name: { full: "Main Author", native: null } },
      },
      {
        role: "Story",
        node: { name: { full: "Story Writer", native: null } },
      },
    ];

    const author = anilistClient.extractAuthor(edges);

    expect(author).toBe("Main Author");
  });

  it("should fallback to Story role if Story & Art not found", () => {
    const edges: AniListStaffEdge[] = [
      {
        role: "Art",
        node: { name: { full: "Artist Name", native: null } },
      },
      {
        role: "Story",
        node: { name: { full: "Story Writer", native: null } },
      },
    ];

    const author = anilistClient.extractAuthor(edges);

    expect(author).toBe("Story Writer");
  });

  it("should fallback to Original Creator role", () => {
    const edges: AniListStaffEdge[] = [
      {
        role: "Original Creator",
        node: { name: { full: "Creator Name", native: null } },
      },
    ];

    const author = anilistClient.extractAuthor(edges);

    expect(author).toBe("Creator Name");
  });

  it("should fallback to first staff member if no priority role found", () => {
    const edges: AniListStaffEdge[] = [
      {
        role: "Editor",
        node: { name: { full: "Editor Name", native: null } },
      },
      {
        role: "Assistant",
        node: { name: { full: "Assistant Name", native: null } },
      },
    ];

    const author = anilistClient.extractAuthor(edges);

    expect(author).toBe("Editor Name");
  });

  it("should use native name if full name is not available", () => {
    const edges: AniListStaffEdge[] = [
      {
        role: "Story & Art",
        node: { name: { full: null, native: "日本名" } },
      },
    ];

    const author = anilistClient.extractAuthor(edges);

    expect(author).toBe("日本名");
  });

  it("should return null for empty staff edges", () => {
    const author = anilistClient.extractAuthor([]);

    expect(author).toBeNull();
  });

  // 7.9 — Test cover URL selection (extraLarge > large > medium)
  it("should prefer extraLarge cover image", () => {
    const coverImage: AniListCoverImage = {
      extraLarge: "https://example.com/xl.jpg",
      large: "https://example.com/l.jpg",
      medium: "https://example.com/m.jpg",
      color: null,
    };

    const url = anilistClient.getCoverUrl(coverImage);

    expect(url).toBe("https://example.com/xl.jpg");
  });

  it("should fallback to large if extraLarge is null", () => {
    const coverImage: AniListCoverImage = {
      extraLarge: null,
      large: "https://example.com/l.jpg",
      medium: "https://example.com/m.jpg",
      color: null,
    };

    const url = anilistClient.getCoverUrl(coverImage);

    expect(url).toBe("https://example.com/l.jpg");
  });

  it("should fallback to medium if large is null", () => {
    const coverImage: AniListCoverImage = {
      extraLarge: null,
      large: null,
      medium: "https://example.com/m.jpg",
      color: null,
    };

    const url = anilistClient.getCoverUrl(coverImage);

    expect(url).toBe("https://example.com/m.jpg");
  });

  it("should return null if no cover images available", () => {
    const coverImage: AniListCoverImage = {
      extraLarge: null,
      large: null,
      medium: null,
      color: null,
    };

    const url = anilistClient.getCoverUrl(coverImage);

    expect(url).toBeNull();
  });

  it("should return null if coverImage is null", () => {
    const url = anilistClient.getCoverUrl(null);

    expect(url).toBeNull();
  });

  // 7.10 — Test empty results handling (totalItems: 0)
  it("should return empty array when no results found", async () => {
    const mockResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: {
            total: 0,
            currentPage: 1,
            hasNextPage: false,
          },
          media: [],
        },
      },
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await anilistClient.searchManga("NonexistentManga");

    expect(results).toEqual([]);
  });

  it("should return empty array when response is null", async () => {
    vi.useRealTimers();

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const results = await anilistClient.searchManga("Test");

    expect(results).toEqual([]);

    vi.useFakeTimers();
  });

  it("should return empty array when data.Page is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const results = await anilistClient.searchManga("Test");

    expect(results).toEqual([]);
  });

  // 7.11 — Test GraphQL error response handling
  it("should handle GraphQL errors in response", async () => {
    const mockErrorResponse = {
      errors: [
        {
          message: "Invalid query",
          status: 400,
        },
      ],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockErrorResponse,
    });

    const promise = anilistClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual([]);
  });

  it("should retry on GraphQL rate limit errors (status 429)", async () => {
    const mockErrorResponse = {
      errors: [
        {
          message: "Rate limit exceeded",
          status: 429,
        },
      ],
    };

    const mockSuccessResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: { total: 1, currentPage: 1, hasNextPage: false },
          media: [
            {
              id: 3,
              title: { romaji: "After Rate Limit", english: null, native: null },
              description: null,
              genres: [],
              coverImage: null,
              status: null,
              volumes: null,
              chapters: null,
              format: null,
              staff: null,
              startDate: null,
              synonyms: [],
              averageScore: null,
            },
          ],
        },
      },
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockErrorResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = anilistClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].title.romaji).toBe("After Rate Limit");
  });

  it("should handle HTTP 429 rate limit with Retry-After header", async () => {
    const mockSuccessResponse: AniListSearchResponse = {
      data: {
        Page: {
          pageInfo: { total: 1, currentPage: 1, hasNextPage: false },
          media: [
            {
              id: 4,
              title: { romaji: "After HTTP 429", english: null, native: null },
              description: null,
              genres: [],
              coverImage: null,
              status: null,
              volumes: null,
              chapters: null,
              format: null,
              staff: null,
              startDate: null,
              synonyms: [],
              averageScore: null,
            },
          ],
        },
      },
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (key: string) => key === "Retry-After" ? "2" : null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = anilistClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].title.romaji).toBe("After HTTP 429");
  });
});
