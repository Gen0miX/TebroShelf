import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../../utils/rateLimiter";

import {
  searchByISBN,
  searchByTitle,
  mapToBookMetadata,
  getCoverUrl,
  fetchWorkDescription,
} from "./openLibraryClient";

// =======================
// Mocks
// =======================

// Mock logger to silence output
vi.mock("../../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock RateLimiter so acquire() always resolves
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

// Helper to mock fetch once
function mockFetchOnce(data: any, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Server Error",
    json: async () => data,
  } as any);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =======================
// Tests
// =======================

describe("OpenLibrary Client", () => {
  // 7.2 — ISBN search with mock response
  it("searchByISBN returns first doc when found", async () => {
    mockFetchOnce({
      numFound: 1,
      docs: [
        {
          key: "/works/OL123",
          title: "Test Book",
        },
      ],
    });

    const result = await searchByISBN("9781234567890");

    expect(result).toBeTruthy();
    expect(result?.title).toBe("Test Book");
    expect(fetch).toHaveBeenCalledOnce();
  });

  // 7.3 — Title + Author search
  it("searchByTitle returns docs list", async () => {
    mockFetchOnce({
      numFound: 2,
      docs: [
        { key: "1", title: "Book A" },
        { key: "2", title: "Book B" },
      ],
    });

    const result = await searchByTitle("Harry Potter", "Rowling");

    expect(result.length).toBe(2);
    expect(result[0].title).toBe("Book A");
  });

  // 7.4 — Rate limiter usage
  it("calls rateLimiter.acquire before fetching", async () => {
    const acquireSpy = vi.spyOn(RateLimiter.prototype, "acquire");

    mockFetchOnce({ numFound: 0, docs: [] });

    await searchByISBN("123");

    expect(acquireSpy).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  // 7.5 — Retry logic on transient failures
  it("retries on transient failures then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network fail"))
      .mockRejectedValueOnce(new Error("Network fail again"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          numFound: 1,
          docs: [{ key: "X", title: "Recovered" }],
        }),
      });

    global.fetch = fetchMock as any;

    const result = await searchByISBN("123");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result?.title).toBe("Recovered");
  });

  // 7.6 — Timeout handling
  it("returns null after timeouts", async () => {
    vi.useFakeTimers();

    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError")) as any;

    const promise = searchByISBN("123");

    // ⬇️ Fais avancer tous les timers (timeouts + retries)
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalled();

    vi.useRealTimers();
  });

  // 7.7 — Parsing various OpenLibrary response formats
  it("maps OpenLibrary book to BookMetadata", () => {
    const book = {
      title: "Test",
      author_name: ["Alice", "Bob"],
      subject: ["Fantasy", "Magic"],
      first_publish_year: 2000,
      isbn: ["12345"],
    };

    const mapped = mapToBookMetadata(book as any);

    expect(mapped).toEqual({
      title: "Test",
      author: "Alice, Bob",
      genres: ["Fantasy", "Magic"],
      publication_date: "2000-01-01",
      isbn: "12345",
    });
  });

  // Bonus — Cover URL builder
  it("builds cover URL correctly", () => {
    expect(getCoverUrl(123)).toContain("/b/id/123-L.jpg");
    expect(getCoverUrl(undefined, "999")).toContain("/b/isbn/999-L.jpg");
    expect(getCoverUrl(undefined, undefined)).toBeNull();
  });

  // H1 — fetchWorkDescription
  it("fetchWorkDescription returns string description", async () => {
    mockFetchOnce({ description: "A great book about testing." });

    const desc = await fetchWorkDescription("/works/OL123W");

    expect(desc).toBe("A great book about testing.");
  });

  it("fetchWorkDescription handles object description format", async () => {
    mockFetchOnce({
      description: { type: "/type/text", value: "Object format description" },
    });

    const desc = await fetchWorkDescription("/works/OL456W");

    expect(desc).toBe("Object format description");
  });

  it("fetchWorkDescription returns null when no description", async () => {
    mockFetchOnce({ title: "No description here" });

    const desc = await fetchWorkDescription("/works/OL789W");

    expect(desc).toBeNull();
  });

  it("fetchWorkDescription returns null on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const desc = await fetchWorkDescription("/works/OL000W");

    expect(desc).toBeNull();
  });
});
