import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../../utils/rateLimiter";
import * as malClient from "./malClient";
import type {
  MalMangaNode,
  MalSearchResponse,
  MalAuthor,
  MalMainPicture,
} from "./malClient";

// =======================
// Mocks
// =======================

// Use vi.hoisted to allow access to config in tests
const mocks = vi.hoisted(() => ({
  malConfig: {
    clientId: "test-client-id",
    baseUrl: "https://api.myanimelist.net/v2",
    rateLimit: 60,
    rateLimitWindow: 60000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
}));

// Mock dependencies
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: () => ({
    myAnimeList: mocks.malConfig,
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

describe("MAL Client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset config to default
    mocks.malConfig.clientId = "test-client-id";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 7.2 — Test manga search with mock REST response (standard data[].node format)
  it("should search for manga and return results in data[].node format", async () => {
    const mockResponse: MalSearchResponse = {
      data: [
        {
          node: {
            id: 2,
            title: "Berserk",
            alternative_titles: {
              synonyms: ["Berserk: The Prototype"],
              en: "Berserk",
              ja: "ベルセルク",
            },
            synopsis: "Guts, a former mercenary now known as the Black Swordsman...",
            genres: [
              { id: 1, name: "Action" },
              { id: 8, name: "Drama" },
              { id: 10, name: "Fantasy" },
            ],
            media_type: "manga",
            status: "finished",
            num_volumes: 41,
            num_chapters: 380,
            authors: [
              {
                node: {
                  id: 1868,
                  first_name: "Kentarou",
                  last_name: "Miura",
                },
                role: "Story & Art",
              },
            ],
            main_picture: {
              medium: "https://cdn.myanimelist.net/images/manga/1/157897.jpg",
              large: "https://cdn.myanimelist.net/images/manga/1/157897l.jpg",
            },
            start_date: "1989-08-25",
          },
        },
      ],
      paging: {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await malClient.searchManga("Berserk");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.myanimelist.net/v2/manga"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-MAL-CLIENT-ID": "test-client-id",
          Accept: "application/json",
        }),
      }),
    );
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Berserk");
    expect(results[0].id).toBe(2);
  });

  // 7.3 — Test X-MAL-CLIENT-ID header is included in requests
  it("should include X-MAL-CLIENT-ID header in requests", async () => {
    const mockResponse: MalSearchResponse = {
      data: [],
      paging: {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    await malClient.searchManga("Test");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-MAL-CLIENT-ID": "test-client-id",
        }),
      }),
    );
  });

  // 7.4 — Test rate limiter enforces 60 req/min
  it("should use rate limiter before making requests (60 req/min)", async () => {
    const acquireSpy = vi.spyOn(RateLimiter.prototype, "acquire");

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    });

    await malClient.searchManga("Test");

    expect(acquireSpy).toHaveBeenCalled();
  });

  // 7.5 — Test retry logic on transient failures (500, network error)
  it("should retry on network errors and eventually succeed", async () => {
    const mockSuccessResponse: MalSearchResponse = {
      data: [
        {
          node: {
            id: 1,
            title: "Success",
            alternative_titles: null,
            synopsis: null,
            genres: [],
            media_type: "manga",
            status: null,
            num_volumes: 0,
            num_chapters: 0,
            authors: [],
            main_picture: null,
            start_date: null,
          },
        },
      ],
      paging: {},
    };

    (fetch as any)
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const promise = malClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Success");
  });

  it("should retry on HTTP 500 errors", async () => {
    const mockSuccessResponse: MalSearchResponse = {
      data: [
        {
          node: {
            id: 2,
            title: "Recovered",
            alternative_titles: null,
            synopsis: null,
            genres: [],
            media_type: "manga",
            status: null,
            num_volumes: 0,
            num_chapters: 0,
            authors: [],
            main_picture: null,
            start_date: null,
          },
        },
      ],
      paging: {},
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

    const promise = malClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Recovered");
  });

  // 7.6 — Test timeout handling (10s AbortController)
  it("should handle timeout using AbortController", async () => {
    (fetch as any).mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    const promise = malClient.searchManga("Test");

    // Advance time to trigger all timeouts and retries
    await vi.advanceTimersByTimeAsync(50000);

    const result = await promise;
    expect(result).toEqual([]);
  });

  // 7.7 — Test missing MAL_CLIENT_ID returns empty array with warning
  it("should return empty array with warning when MAL_CLIENT_ID is missing", async () => {
    // Set clientId to empty string
    mocks.malConfig.clientId = "";

    const { logger } = await import("../../../utils/logger");

    const results = await malClient.searchManga("Test");

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      "MAL_CLIENT_ID not configured, skipping MAL search",
      expect.any(Object),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  // 7.8 — Test parsing of MAL manga node to BookMetadata
  it("should correctly map MAL manga node to BookMetadata", () => {
    const manga: MalMangaNode = {
      id: 100,
      title: "One Piece",
      alternative_titles: {
        synonyms: ["OP"],
        en: "One Piece",
        ja: "ワンピース",
      },
      synopsis: "A story about pirates searching for treasure",
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
        { id: 3, name: "Comedy" },
        { id: 4, name: "Drama" },
        { id: 5, name: "Fantasy" },
        { id: 6, name: "Shounen" },
      ],
      media_type: "manga",
      status: "publishing",
      num_volumes: 0,
      num_chapters: 0,
      authors: [
        {
          node: {
            id: 1881,
            first_name: "Eiichiro",
            last_name: "Oda",
          },
          role: "Story & Art",
        },
      ],
      main_picture: {
        medium: "https://cdn.myanimelist.net/images/manga/2/253146.jpg",
        large: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
      },
      start_date: "1997-07-22",
    };

    const metadata = malClient.mapToBookMetadata(manga);

    expect(metadata.title).toBe("One Piece");
    expect(metadata.author).toBe("Eiichiro Oda");
    expect(metadata.description).toBe("A story about pirates searching for treasure");
    expect(metadata.genres).toEqual(["Action", "Adventure", "Comedy", "Drama", "Fantasy"]);
    expect(metadata.publication_date).toBe("1997-07-22");
  });

  // 7.9 — Test author extraction from authors array (first_name + last_name, role filtering)
  it("should extract author from authors array with priority", () => {
    const authors: MalAuthor[] = [
      {
        node: {
          id: 1,
          first_name: "Artist",
          last_name: "Name",
        },
        role: "Art",
      },
      {
        node: {
          id: 2,
          first_name: "Main",
          last_name: "Author",
        },
        role: "Story & Art",
      },
      {
        node: {
          id: 3,
          first_name: "Story",
          last_name: "Writer",
        },
        role: "Story",
      },
    ];

    const author = malClient.getAuthorName(authors);

    expect(author).toBe("Main Author");
  });

  it("should fallback to Story role if Story & Art not found", () => {
    const authors: MalAuthor[] = [
      {
        node: {
          id: 1,
          first_name: "Artist",
          last_name: "Name",
        },
        role: "Art",
      },
      {
        node: {
          id: 2,
          first_name: "Story",
          last_name: "Writer",
        },
        role: "Story",
      },
    ];

    const author = malClient.getAuthorName(authors);

    expect(author).toBe("Story Writer");
  });

  it("should fallback to first author if no priority role found", () => {
    const authors: MalAuthor[] = [
      {
        node: {
          id: 1,
          first_name: "Editor",
          last_name: "Name",
        },
        role: "Editor",
      },
      {
        node: {
          id: 2,
          first_name: "Assistant",
          last_name: "Name",
        },
        role: "Assistant",
      },
    ];

    const author = malClient.getAuthorName(authors);

    expect(author).toBe("Editor Name");
  });

  it("should return null for empty authors array", () => {
    const author = malClient.getAuthorName([]);

    expect(author).toBeNull();
  });

  it("should handle authors with only first name", () => {
    const authors: MalAuthor[] = [
      {
        node: {
          id: 1,
          first_name: "Madonna",
          last_name: "",
        },
        role: "Story & Art",
      },
    ];

    const author = malClient.getAuthorName(authors);

    expect(author).toBe("Madonna");
  });

  it("should handle authors with only last name", () => {
    const authors: MalAuthor[] = [
      {
        node: {
          id: 1,
          first_name: "",
          last_name: "CLAMP",
        },
        role: "Story & Art",
      },
    ];

    const author = malClient.getAuthorName(authors);

    expect(author).toBe("CLAMP");
  });

  // 7.10 — Test genre extraction (array of objects → array of strings)
  it("should extract genre names from genre objects", () => {
    const manga: MalMangaNode = {
      id: 1,
      title: "Test Manga",
      alternative_titles: null,
      synopsis: null,
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
        { id: 3, name: "Fantasy" },
      ],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    const metadata = malClient.mapToBookMetadata(manga);

    expect(metadata.genres).toEqual(["Action", "Adventure", "Fantasy"]);
  });

  it("should limit genres to 5 items", () => {
    const manga: MalMangaNode = {
      id: 1,
      title: "Test Manga",
      alternative_titles: null,
      synopsis: null,
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
        { id: 3, name: "Comedy" },
        { id: 4, name: "Drama" },
        { id: 5, name: "Fantasy" },
        { id: 6, name: "Shounen" },
        { id: 7, name: "Supernatural" },
      ],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    const metadata = malClient.mapToBookMetadata(manga);

    expect(metadata.genres?.length).toBe(5);
    expect(metadata.genres).toEqual(["Action", "Adventure", "Comedy", "Drama", "Fantasy"]);
  });

  // 7.11 — Test cover URL selection (large > medium)
  it("should prefer large cover image", () => {
    const mainPicture: MalMainPicture = {
      medium: "https://cdn.myanimelist.net/images/manga/1/157897.jpg",
      large: "https://cdn.myanimelist.net/images/manga/1/157897l.jpg",
    };

    const url = malClient.getCoverUrl(mainPicture);

    expect(url).toBe("https://cdn.myanimelist.net/images/manga/1/157897l.jpg");
  });

  it("should fallback to medium if large is not available", () => {
    const mainPicture: MalMainPicture = {
      medium: "https://cdn.myanimelist.net/images/manga/1/157897.jpg",
      large: "",
    };

    const url = malClient.getCoverUrl(mainPicture);

    expect(url).toBe("https://cdn.myanimelist.net/images/manga/1/157897.jpg");
  });

  it("should return null if no cover images available", () => {
    const mainPicture: MalMainPicture = {
      medium: "",
      large: "",
    };

    const url = malClient.getCoverUrl(mainPicture);

    expect(url).toBeNull();
  });

  it("should return null if mainPicture is null", () => {
    const url = malClient.getCoverUrl(null);

    expect(url).toBeNull();
  });

  // 7.12 — Test empty results handling (data: [])
  it("should return empty array when no results found", async () => {
    const mockResponse: MalSearchResponse = {
      data: [],
      paging: {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await malClient.searchManga("NonexistentManga");

    expect(results).toEqual([]);
  });

  it("should return empty array when response is null", async () => {
    vi.useRealTimers();

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const results = await malClient.searchManga("Test");

    expect(results).toEqual([]);

    vi.useFakeTimers();
  });

  it("should return empty array when data is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ paging: {} }),
    });

    const results = await malClient.searchManga("Test");

    expect(results).toEqual([]);
  });

  // 7.13 — Test HTTP error responses (401 unauthorized, 403 forbidden, 429 rate limited)
  it("should handle 401 unauthorized and not retry", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const { logger } = await import("../../../utils/logger");

    const results = await malClient.searchManga("Test");

    expect(results).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      "MAL authentication failed",
      expect.objectContaining({ status: 401 }),
    );
    expect(fetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("should handle 403 forbidden and not retry", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const { logger } = await import("../../../utils/logger");

    const results = await malClient.searchManga("Test");

    expect(results).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      "MAL authentication failed",
      expect.objectContaining({ status: 403 }),
    );
    expect(fetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("should handle 429 rate limited with Retry-After header", async () => {
    const mockSuccessResponse: MalSearchResponse = {
      data: [
        {
          node: {
            id: 3,
            title: "After Rate Limit",
            alternative_titles: null,
            synopsis: null,
            genres: [],
            media_type: "manga",
            status: null,
            num_volumes: 0,
            num_chapters: 0,
            authors: [],
            main_picture: null,
            start_date: null,
          },
        },
      ],
      paging: {},
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          get: (key: string) => (key === "Retry-After" ? "2" : null),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const { logger } = await import("../../../utils/logger");

    const promise = malClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("After Rate Limit");
    expect(logger.warn).toHaveBeenCalledWith(
      "MAL rate limited",
      expect.objectContaining({ retryAfter: 2 }),
    );
  });

  it("should use default retry after if header is missing", async () => {
    const mockSuccessResponse: MalSearchResponse = {
      data: [
        {
          node: {
            id: 4,
            title: "After Default Retry",
            alternative_titles: null,
            synopsis: null,
            genres: [],
            media_type: "manga",
            status: null,
            num_volumes: 0,
            num_chapters: 0,
            authors: [],
            main_picture: null,
            start_date: null,
          },
        },
      ],
      paging: {},
    };

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          get: () => null,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

    const { logger } = await import("../../../utils/logger");

    const promise = malClient.searchManga("Test");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.length).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "MAL rate limited",
      expect.objectContaining({ retryAfter: 60 }),
    );
  });

  // Additional test: Verify URL construction with query parameters
  it("should construct correct URL with query parameters", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    });

    await malClient.searchManga("Test Manga", 10);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=Test+Manga"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=10"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("fields="),
      expect.any(Object),
    );
  });

  // Additional test: Verify HTML stripping in synopsis
  it("should strip HTML tags from synopsis", () => {
    const manga: MalMangaNode = {
      id: 1,
      title: "Test",
      alternative_titles: null,
      synopsis: "<p>This is a <strong>test</strong> description.</p><br/>With line breaks.",
      genres: [],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    const metadata = malClient.mapToBookMetadata(manga);

    expect(metadata.description).not.toContain("<p>");
    expect(metadata.description).not.toContain("<strong>");
    expect(metadata.description).not.toContain("<br/>");
    expect(metadata.description).toContain("This is a test description");
  });

  it("should decode HTML entities in synopsis", () => {
    const manga: MalMangaNode = {
      id: 1,
      title: "Test",
      alternative_titles: null,
      synopsis: "Test &amp; description with &lt;special&gt; &quot;characters&quot;",
      genres: [],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    const metadata = malClient.mapToBookMetadata(manga);

    expect(metadata.description).toBe('Test & description with <special> "characters"');
  });
});
