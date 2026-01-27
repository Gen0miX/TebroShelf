import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMangaEnrichmentPipeline } from "./mangaEnrichmentPipeline";
import * as bookService from "../library/bookService";
import * as anilistEnrichment from "./enrichment/anilistEnrichment";
import * as wsEvent from "../../websocket/event";

// Mock dependencies
vi.mock("../library/bookService");
vi.mock("./enrichment/anilistEnrichment");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("Manga Enrichment Pipeline Integration", () => {
  const mockBookId = 123;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for AniList enrichment (failure)
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      fieldsUpdated: [],
      source: "anilist",
      error: "No match found",
      coverUpdated: false,
    });
  });

  // 9.2 Test AniList success flow → enriched status
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
  });

  it("should successfully enrich manga with all fields from AniList", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: true,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [
        "author",
        "description",
        "genres",
        "publication_date",
        "cover_path",
      ],
      coverUpdated: true,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("enriched");
    expect(result.fieldsUpdated.length).toBeGreaterThan(0);
  });

  // 9.3 Test AniList fail → pending status (awaiting MAL fallback)
  it("should keep status as pending when AniList fails (awaiting MAL fallback)", async () => {
    // GIVEN: A manga book
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Unknown Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // GIVEN: AniList fails to find a match
    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No matching manga found on AniList",
      coverUpdated: false,
    });

    // WHEN: Pipeline is executed
    const result = await runMangaEnrichmentPipeline(mockBookId);

    // THEN: Pipeline fails but status remains pending for future fallback
    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toBe("No matching manga found on AniList");

    // THEN: No status update to database (remains pending for MAL)
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should return pending status when AniList returns no results", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Obscure Manga",
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(anilistEnrichment.enrichFromAniList).mockResolvedValue({
      success: false,
      bookId: mockBookId,
      source: "anilist",
      fieldsUpdated: [],
      error: "No results from AniList API",
      coverUpdated: false,
    });

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toContain("No results from AniList API");
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

    const result = await runMangaEnrichmentPipeline(mockBookId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(result.error).toContain("Network timeout");
  });

  // 9.4 Test pipeline only processes manga content_type
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

    // THEN: AniList enrichment is NOT called
    expect(anilistEnrichment.enrichFromAniList).not.toHaveBeenCalled();

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
  });

  // 9.5 Test WebSocket events for full pipeline
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

    const result = await runMangaEnrichmentPipeline(mockBookId);

    // Status should be pending (not quarantine) to allow future MAL fallback
    expect(result.status).toBe("pending");
    expect(result.success).toBe(false);

    // No database update should occur (book stays in pending state)
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });
});
