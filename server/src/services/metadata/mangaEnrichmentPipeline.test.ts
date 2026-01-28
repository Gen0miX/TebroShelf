import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMangaEnrichmentPipeline } from "./mangaEnrichmentPipeline";
import * as bookService from "../library/bookService";
import * as anilistEnrichment from "./enrichment/anilistEnrichment";
import * as malEnrichment from "./enrichment/malEnrichment";
import * as mangadexEnrichment from "./enrichment/mangadexEnrichment";
import * as wsEvent from "../../websocket/event";

// Use vi.hoisted to allow access to config in tests
const mocks = vi.hoisted(() => ({
  aniListConfig: {
    graphqlEndpoint: "https://graphql.anilist.co",
    rateLimit: 90,
    rateLimitWindow: 60000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
  malConfig: {
    clientId: "test-client-id",
    baseUrl: "https://api.myanimelist.net/v2",
    rateLimit: 60,
    rateLimitWindow: 60000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
  mangaDexConfig: {
    baseUrl: "https://api.mangadex.org",
    coverBaseUrl: "https://uploads.mangadex.org",
    rateLimit: 5,
    rateLimitWindow: 1000,
    searchTimeout: 10000,
    maxRetries: 3,
  },
}));

// Mock dependencies
vi.mock("../library/bookService");
vi.mock("./enrichment/anilistEnrichment");
vi.mock("./enrichment/malEnrichment");
vi.mock("./enrichment/mangadexEnrichment");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");
vi.mock("../../config/scraping", () => ({
  getScrapingConfig: () => ({
    aniList: mocks.aniListConfig,
    myAnimeList: mocks.malConfig,
    mangaDex: mocks.mangaDexConfig,
  }),
}));

describe("Manga Enrichment Pipeline Integration", () => {
  const mockBookId = 123;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset configs to default
    mocks.malConfig.clientId = "test-client-id";

    // Default mock for AniList enrichment (failure)
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      fieldsUpdated: [],
      source: "anilist",
      error: "No match found",
      coverUpdated: false,
    });

    // Default mock for MAL enrichment (failure)
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      fieldsUpdated: [],
      source: "myanimelist",
      error: "No match found",
      coverUpdated: false,
    });

    // Default mock for MangaDex enrichment (failure)
    vi.mocked(mangadexEnrichment.enrichFromMangaDex).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      fieldsUpdated: [],
      source: "mangadex",
      error: "No match found",
      coverUpdated: false,
    });
  });

  // ===========================
  // 9.2 Test AniList success → enriched (MAL not called)
  // ===========================
  it("should run full flow: find manga, enrich via AniList, and update to enriched status", async () => {
    // GIVEN: A manga book in database without metadata
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Berserk",
      author: null,
      description: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // GIVEN: AniList returns enrichment data
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: ["author", "description", "genres", "cover_path"],
      coverUpdated: true,
    });

    // WHEN: Pipeline is executed
    const result = await runMangaEnrichmentPipeline(mockBookId);

    // THEN: Pipeline succeeds
    expect(result.success).toBe(true);
    expect(result.source).toBe("anilist");
    expect(result.status).toBe("enriched");
    expect(result.fieldsUpdated).toEqual([
      "author",
      "description",
      "genres",
      "cover_path",
    ]);

    // THEN: AniList enrichment was called
    expect(anilistEnrichment.enrichFromAniList).toHaveBeenCalledWith(mockBookId);

    // THEN: MAL enrichment was NOT called (AniList succeeded)
    expect(malEnrichment.enrichFromMyAnimeList).not.toHaveBeenCalled();
    // THEN: MangaDex enrichment was NOT called (AniList succeeded)
    expect(mangadexEnrichment.enrichFromMangaDex).not.toHaveBeenCalled();
  });

  // ===========================
  // 9.3 Test AniList fail → MAL success → enriched with source="myanimelist"
  // ===========================
  it("should fallback to MAL when AniList fails and succeed with MAL", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Naruto",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // AniList fails
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No matching manga found on AniList",
      coverUpdated: false,
    });

    // MAL succeeds
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: ["author", "description", "genres"],
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline succeeds with MAL as source
    expect(result.success).toBe(true);
    expect(result.source).toBe("myanimelist");
    expect(result.status).toBe("enriched");
    expect(result.fieldsUpdated).toEqual(["author", "description", "genres"]);

    // Both services should be called, but not MangaDex
    expect(anilistEnrichment.enrichFromAniList).toHaveBeenCalledWith(mockBookId);
    expect(malEnrichment.enrichFromMyAnimeList).toHaveBeenCalledWith(mockBookId);
    expect(mangadexEnrichment.enrichFromMangaDex).not.toHaveBeenCalled();
  });

  it("should enrich with MAL after AniList returns no results", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Bleach",
      author: null,
      description: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // AniList returns no results
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No results from AniList API",
      coverUpdated: false,
    });

    // MAL succeeds
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: ["author", "description", "cover_path"],
      coverUpdated: true,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(true);
    expect(result.source).toBe("myanimelist");
    expect(result.status).toBe("enriched");
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).toContain("cover_path");
    expect(mangadexEnrichment.enrichFromMangaDex).not.toHaveBeenCalled();
  });

  // ===========================
  // 9.4 Test AniList fail → MAL fail → pending (awaiting MangaDex fallback)
  // ===========================
  it("should keep status as pending when both AniList and MAL fail", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Unknown Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // Both AniList and MAL fail
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No matching manga found on AniList",
      coverUpdated: false,
    });

    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: [],
      error: "No matching manga found on MyAnimeList",
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline fails but status remains pending for future MangaDex fallback
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toContain("No match found"); // Finally fails on MangaDex

    // MangaDex should have been called
    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalledWith(mockBookId);
  });

  // ===========================
  // 8.4 Test AniList fail -> MAL fail -> MangaDex success -> enriched with source="mangadex"
  // ===========================
  it("should fallback to MangaDex when AniList and MAL fail, and succeed with MangaDex", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Solo Leveling",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // AniList fails
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "AniList fail",
      coverUpdated: false,
    });

    // MAL fails
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: [],
      error: "MAL fail",
      coverUpdated: false,
    });

    // MangaDex succeeds
    vi.mocked(mangadexEnrichment.enrichFromMangaDex).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "mangadex",
      fieldsUpdated: ["description", "genres"],
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(true);
    expect(result.source).toBe("mangadex");
    expect(result.status).toBe("enriched");
    expect(result.fieldsUpdated).toEqual(["description", "genres"]);

    expect(anilistEnrichment.enrichFromAniList).toHaveBeenCalledWith(mockBookId);
    expect(malEnrichment.enrichFromMyAnimeList).toHaveBeenCalledWith(mockBookId);
    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalledWith(mockBookId);
  });

  it("should enrich with MangaDex as the final available source", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "MangaDex Specific",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(mangadexEnrichment.enrichFromMangaDex).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "mangadex",
      fieldsUpdated: ["author"],
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(true);
    expect(result.source).toBe("mangadex");
    expect(result.status).toBe("enriched");
  });

  // ===========================
  // 8.5 Test AniList fail -> MAL fail -> MangaDex fail -> pending
  // ===========================
  it("should remain pending if all sources fail", async () => {
     const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Totally Unknown",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toBe("No match found"); // From final source (MangaDex)

    expect(anilistEnrichment.enrichFromAniList).toHaveBeenCalled();
    expect(malEnrichment.enrichFromMyAnimeList).toHaveBeenCalled();
    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalled();
  });

  it("should handle AniList API errors and keep status pending", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "Error: Network timeout",
      coverUpdated: false,
    });

    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: [],
      error: "Error: Network timeout",
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);
 
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toBe("No match found"); // Finally fails on MangaDex

    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalledWith(mockBookId);
  });

  // ===========================
  // 9.5 Test AniList fail → MAL skipped (no client ID) → pending
  // ===========================
  it("should skip MAL when MAL_CLIENT_ID is not configured", async () => {
    // Set MAL client ID to empty
    mocks.malConfig.clientId = "";

    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // AniList fails
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No matching manga found on AniList",
      coverUpdated: false,
    });

    // MAL returns error due to missing client ID
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: [],
      error: "MAL_CLIENT_ID not configured",
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline fails and remains pending
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toBe("No match found"); // Finally fails on MangaDex

    // AniList should be called
    expect(anilistEnrichment.enrichFromAniList).toHaveBeenCalledWith(mockBookId);

    // MAL should still be called (it handles the missing client ID internally)
    expect(malEnrichment.enrichFromMyAnimeList).toHaveBeenCalledWith(mockBookId);

    // MangaDex should be called
    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalledWith(mockBookId);
  });

  // ===========================
  // 9.7 Test pipeline only processes manga content_type
  // ===========================
  it("should skip enrichment for non-manga content (ebooks)", async () => {
    // GIVEN: A regular ebook (not manga)
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Regular Book",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // WHEN: Pipeline is executed
    const result = await runMangaEnrichmentPipeline(mockBookId);

    // THEN: Pipeline skips processing
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");

    // THEN: Neither AniList nor MAL enrichment is called
    expect(anilistEnrichment.enrichFromAniList).not.toHaveBeenCalled();
    expect(malEnrichment.enrichFromMyAnimeList).not.toHaveBeenCalled();

    // THEN: No database updates
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should only process books with content_type === 'manga'", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "comic",
      title: "Comic Book",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(false);
    expect(anilistEnrichment.enrichFromAniList).not.toHaveBeenCalled();
    expect(malEnrichment.enrichFromMyAnimeList).not.toHaveBeenCalled();
  });

  it("should return error if book not found", async () => {
    // GIVEN: Book does not exist
    vi.mocked(bookService.getBookById).mockResolvedValue(null);

    // WHEN: Pipeline is executed
    const result = await runMangaEnrichmentPipeline(999);

    // THEN: Pipeline fails with appropriate error
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toBe("Book not found");

    // THEN: No enrichment attempted
    expect(anilistEnrichment.enrichFromAniList).not.toHaveBeenCalled();
    expect(malEnrichment.enrichFromMyAnimeList).not.toHaveBeenCalled();
  });

  // ===========================
  // 9.6 Test WebSocket events emitted at each pipeline stage
  // ===========================
  it("should emit pipeline-started event when pipeline begins", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Naruto",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: ["author"],
      coverUpdated: false,
    });

    await runMangaEnrichmentPipeline(mockBookId);

    // Verify pipeline start event
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "manga-pipeline-started",
      expect.objectContaining({ contentType: "manga" }),
    );
  });

  it("should emit WebSocket events during successful enrichment flow", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Attack on Titan",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: ["author", "description", "genres"],
      coverUpdated: true,
    });

    await runMangaEnrichmentPipeline(mockBookId);

    // 1. Verify pipeline started event
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "manga-pipeline-started",
      expect.objectContaining({ contentType: "manga" }),
    );

    // 2. AniList enrichment emits its own events (tested in anilistEnrichment.test.ts)
    // The pipeline itself doesn't emit completion events - that's handled by the enrichment service
  });

  it("should emit WebSocket events during MAL fallback flow", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Dragon Ball",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // AniList fails
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No match found",
      coverUpdated: false,
    });

    // MAL succeeds
    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: ["author", "description"],
      coverUpdated: false,
    });

    await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline started event should be emitted
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "manga-pipeline-started",
      expect.objectContaining({ contentType: "manga" }),
    );

    // Both enrichment services emit their own events
    // AniList emits search-started, no-match events
    // MAL emits search-started, match-found, completion events
  });

  it("should not emit failure events when AniList succeeds", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Death Note",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: ["author"],
      coverUpdated: false,
    });

    await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline should NOT emit enrichment-failed when AniList succeeds
    expect(wsEvent.emitEnrichmentProgress).not.toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.any(Object),
    );
  });

  it("should handle exceptions gracefully and return error", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // Simulate an unexpected error
    vi.mocked(anilistEnrichment.enrichFromAniList).mockRejectedValue(
      new Error("Unexpected API error"),
    );

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toContain("Unexpected API error");
  });

  it("should emit pipeline-started event even for non-manga books before skipping", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Regular Book",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    await runMangaEnrichmentPipeline(mockBookId);

    // Pipeline should NOT emit started event for non-manga
    expect(wsEvent.emitEnrichmentProgress).not.toHaveBeenCalledWith(
      mockBookId,
      "manga-pipeline-started",
      expect.any(Object),
    );
  });

  // Additional test for future MAL fallback preparation
  it("should prepare for future MAL fallback by keeping status pending", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Manga for MAL",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No match on AniList",
      coverUpdated: false,
    });

    vi.mocked(malEnrichment.enrichFromMyAnimeList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "myanimelist",
      fieldsUpdated: [],
      error: "No match on MAL",
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    // Status should be pending (not quarantine) to allow future quarantine implementation
    expect(result.status).toBe("pending");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No match found"); // Finally fails on MangaDex

    expect(mangadexEnrichment.enrichFromMangaDex).toHaveBeenCalled();

    // No database update should occur (book stays in pending state)
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });
});
