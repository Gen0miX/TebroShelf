import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as googleBooksClient from "./googleBooksClient";
import { RateLimiter } from "../../../utils/rateLimiter";

// Use vi.hoisted to allow access to config in tests
const mocks = vi.hoisted(() => ({
  googleBooksConfig: {
    apiBaseUrl: "https://www.googleapis.com/books/v1",
    apiKey: "test-api-key",
    rateLimit: 100,
    rateLimitWindow: 60000,
    searchTimeout: 500,
    maxRetries: 3,
  },
}));

// Mock dependencies
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: () => ({
    googleBooks: mocks.googleBooksConfig,
  }),
}));

vi.mock("../../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock RateLimiter using class pattern to fix "not a constructor"
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

describe("GoogleBooksClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    // Reset config before each test
    mocks.googleBooksConfig.apiKey = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 6.2 Test ISBN search
  it("should search by ISBN and return the first item", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [{ id: "1", volumeInfo: { title: "Test Book" } }],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await googleBooksClient.searchByISBN("1234567890");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("isbn%3A1234567890"),
      expect.any(Object),
    );
    expect(result?.id).toBe("1");
  });

  // 6.3 Test title+author search
  it("should search by title and author", async () => {
    const mockResponse = {
      totalItems: 1,
      items: [{ id: "2", volumeInfo: { title: "Clean Code" } }],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await googleBooksClient.searchByTitle(
      "Clean Code",
      "Robert Martin",
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "intitle%3AClean%20Code%2Binauthor%3ARobert%20Martin",
      ),
      expect.any(Object),
    );
    expect(results.length).toBe(1);
  });

  // 6.4 Test rate limiter enforces 100 req/min
  it("should use rate limiter before making requests", async () => {
    // Spy on the prototype method
    const acquireSpy = vi.spyOn(RateLimiter.prototype, "acquire");

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ totalItems: 0 }),
    });

    await googleBooksClient.searchByISBN("123");

    expect(acquireSpy).toHaveBeenCalled();
  });

  // 6.5 Test retry logic on transient failures
  it("should retry on failure and eventually succeed", async () => {
    (fetch as any)
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 1, items: [{ id: "retry-success" }] }),
      });

    const promise = googleBooksClient.searchByISBN("123");

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result?.id).toBe("retry-success");
  });

  // 6.6 Test timeout handling
  it("should handle timeout using AbortController", async () => {
    (fetch as any).mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")));
      });
    });

    const promise = googleBooksClient.searchByISBN("123");

    // Advance time enough to cover all retries (3 retries with backoff: 500 + 1000 + 500 + 2000 + 500 = ~4.5s)
    await vi.advanceTimersByTimeAsync(15000);

    const result = await promise;
    expect(result).toBeNull();
  });

  // 6.7 Test parsing of various Google Books response formats
  it("should correctly map Google Books data to BookMetadata", () => {
    const mockVolume = {
      id: "abc",
      volumeInfo: {
        title: "Le Petit Prince",
        authors: ["Antoine de Saint-Exupéry"],
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9781234567890" }],
        categories: ["Fiction", "Classic"],
      },
    };

    const metadata = googleBooksClient.mapToBookMetadata(mockVolume as any);

    expect(metadata.title).toBe("Le Petit Prince");
    expect(metadata.author).toBe("Antoine de Saint-Exupéry");
    expect(metadata.isbn).toBe("9781234567890");
    expect(metadata.genres).toContain("Fiction");
  });

  it("should return the best available cover URL", () => {
    const images = {
      smallThumbnail: "http://small.jpg",
      medium: "http://medium.jpg",
      extraLarge: "http://xlarge.jpg?zoom=5",
    };

    const url = googleBooksClient.getCoverUrl(images);
    expect(url).toBe("https://xlarge.jpg?zoom=1");
  });

  // 6.8 & 6.9 Test API Key configuration
  it("should check if configured", () => {
    expect(googleBooksClient.isConfigured()).toBe(true);
  });

  // H3: Test generic searchBooks function
  it("should search with a free-form query via searchBooks", async () => {
    const mockResponse = {
      totalItems: 2,
      items: [
        { id: "a", volumeInfo: { title: "Result A" } },
        { id: "b", volumeInfo: { title: "Result B" } },
      ],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const results = await googleBooksClient.searchBooks("javascript", 3);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=javascript"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("maxResults=3"),
      expect.any(Object),
    );
    expect(results.length).toBe(2);
  });

  // M5: Test query sanitization for special characters
  it("should sanitize special characters in title query", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ totalItems: 0 }),
    });

    await googleBooksClient.searchByTitle("C++: The Good Parts", "Author");

    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    // Colons and plus signs should be replaced with spaces
    expect(calledUrl).not.toContain("intitle%3AC%2B%2B%3A");
    expect(calledUrl).toContain("intitle%3AC");
  });

  it("should throw error if API key is missing", async () => {
    // Modify the hoisted mock
    mocks.googleBooksConfig.apiKey = "";

    // isConfigured should return false
    expect(googleBooksClient.isConfigured()).toBe(false);

    // searchByISBN should throw
    await expect(
      googleBooksClient.searchByISBN("123"),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: GOOGLE_BOOKS_API_KEY environment variable is not set]`,
    );
  });
});
