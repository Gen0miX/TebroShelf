import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichFromMyAnimeList } from "./malEnrichment";
import * as bookService from "../../library/bookService";
import * as malClient from "../sources/malClient";
import * as coverDownloader from "../coverDownloader";
import * as wsEvent from "../../../websocket/event";
import type { MalMangaNode } from "../sources/malClient";

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
vi.mock("../../library/bookService");
vi.mock("../sources/malClient");
vi.mock("../coverDownloader");
vi.mock("../../../websocket/event");
vi.mock("../../../utils/logger");
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: () => ({
    myAnimeList: mocks.malConfig,
  }),
}));

describe("MAL Enrichment Service", () => {
  const mockBookId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to default
    mocks.malConfig.clientId = "test-client-id";
  });

  // 8.2 Test successful enrichment with all fields populated
  it("should enrich all fields when API returns full metadata", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Berserk",
      author: null,
      description: null,
      genres: null,
      publication_date: null,
      cover_path: null,
    };

    const mockMalManga: MalMangaNode = {
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
        { id: 27, name: "Seinen" },
        { id: 37, name: "Supernatural" },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Berserk",
      author: "Kentarou Miura",
      description: "Guts, a former mercenary now known as the Black Swordsman...",
      genres: ["Action", "Drama", "Fantasy", "Seinen", "Supernatural"],
      publication_date: "1989-08-25",
    });
    vi.mocked(malClient.getCoverUrl).mockReturnValue(
      "https://cdn.myanimelist.net/images/manga/1/157897l.jpg",
    );
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
    expect(result.source).toBe("myanimelist");
    expect(result.fieldsUpdated).not.toContain("title"); // Title already exists
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).toContain("description");
    expect(result.fieldsUpdated).toContain("genres");
    expect(result.fieldsUpdated).toContain("publication_date");
    expect(result.fieldsUpdated).toContain("cover_path");
    expect(result.coverUpdated).toBe(true);

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        author: "Kentarou Miura",
        description: "Guts, a former mercenary now known as the Black Swordsman...",
        status: "enriched",
        cover_path: "covers/1.jpg",
      }),
    );
  });

  // 8.3 Test partial enrichment (some fields missing from API)
  it("should only update missing fields and not overwrite existing ones", async () => {
    const partialBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Existing Title",
      author: null,
      description: "Existing Description",
      genres: null,
      cover_path: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "New Title",
      alternative_titles: null,
      synopsis: "New Description",
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
      ],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [
        {
          node: {
            id: 1,
            first_name: "New",
            last_name: "Author",
          },
          role: "Story",
        },
      ],
      main_picture: null,
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(partialBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "New Title",
      author: "New Author",
      description: "New Description",
      genres: ["Action", "Adventure"],
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).not.toContain("title"); // Already exists
    expect(result.fieldsUpdated).toContain("author"); // Was null
    expect(result.fieldsUpdated).not.toContain("description"); // Already exists
    expect(result.fieldsUpdated).toContain("genres"); // Was null

    const updateCall = vi.mocked(bookService.updateBook).mock.calls[0][1];
    expect(updateCall).not.toHaveProperty("title");
    expect(updateCall).not.toHaveProperty("description");
    expect(updateCall).toHaveProperty("author", "New Author");
  });

  // 8.4 Test title matching across title, alternative_titles.en, alternative_titles.ja, synonyms
  it("should match title using main title", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 13,
      title: "One Piece",
      alternative_titles: {
        synonyms: ["OP"],
        en: "One Piece",
        ja: "ワンピース",
      },
      synopsis: "Pirates adventure",
      genres: [{ id: 1, name: "Action" }],
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
      main_picture: null,
      start_date: "1997-07-22",
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
      author: "Eiichiro Oda",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
    expect(malClient.searchManga).toHaveBeenCalled();
  });

  it("should match title using alternative_titles.en", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Attack on Titan",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 23390,
      title: "Shingeki no Kyojin",
      alternative_titles: {
        synonyms: [],
        en: "Attack on Titan",
        ja: "進撃の巨人",
      },
      synopsis: "Titans attack humanity",
      genres: [{ id: 1, name: "Action" }],
      media_type: "manga",
      status: "finished",
      num_volumes: 34,
      num_chapters: 141,
      authors: [
        {
          node: {
            id: 11705,
            first_name: "Hajime",
            last_name: "Isayama",
          },
          role: "Story & Art",
        },
      ],
      main_picture: null,
      start_date: "2009-09-09",
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
      author: "Hajime Isayama",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
  });

  it("should match title using alternative_titles.ja", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "進撃の巨人",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 23390,
      title: "Shingeki no Kyojin",
      alternative_titles: {
        synonyms: [],
        en: "Attack on Titan",
        ja: "進撃の巨人",
      },
      synopsis: "Titans attack humanity",
      genres: [{ id: 1, name: "Action" }],
      media_type: "manga",
      status: "finished",
      num_volumes: 34,
      num_chapters: 141,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
  });

  it("should match title using synonyms", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "OP",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 13,
      title: "One Piece",
      alternative_titles: {
        synonyms: ["OP", "One-Piece"],
        en: "One Piece",
        ja: "ワンピース",
      },
      synopsis: "Pirates adventure",
      genres: [],
      media_type: "manga",
      status: "publishing",
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
  });

  // 8.5 Test cover download when cover is missing
  it("should download cover if available and missing in book", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
      cover_path: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 13,
      title: "One Piece",
      alternative_titles: null,
      synopsis: "Pirates adventure",
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Adventure" },
      ],
      media_type: "manga",
      status: "publishing",
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: {
        medium: "https://cdn.myanimelist.net/images/manga/2/253146.jpg",
        large: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
      },
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });
    vi.mocked(malClient.getCoverUrl).mockReturnValue(
      "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
    );
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(malClient.getCoverUrl).toHaveBeenCalledWith(
      mockMalManga.main_picture,
    );
    expect(coverDownloader.downloadCover).toHaveBeenCalledWith(
      "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
      mockBookId,
    );
    expect(result.coverUpdated).toBe(true);
  });

  // 8.6 Test cover NOT downloaded when cover already exists
  it("should skip cover download if book already has cover", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
      cover_path: "covers/existing.jpg",
    };

    const mockMalManga: MalMangaNode = {
      id: 13,
      title: "One Piece",
      alternative_titles: null,
      synopsis: null,
      genres: [],
      media_type: "manga",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: {
        medium: "https://cdn.myanimelist.net/images/manga/2/253146.jpg",
        large: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
      },
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(coverDownloader.downloadCover).not.toHaveBeenCalled();
    expect(result.coverUpdated).toBe(false);
  });

  // 8.7 Test status update to 'enriched' on success
  it("should update status to enriched on success", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "Test Manga",
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromMyAnimeList(mockBookId);

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({ status: "enriched" }),
    );
  });

  it("should update status to enriched even when no fields are updated", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Existing Title",
      author: "Existing Author",
      description: "Existing Description",
      genres: '["Genre1"]',
      publication_date: "2020-01-01",
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "Existing Title",
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Existing Title",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated.length).toBe(0);
    expect(bookService.updateBook).toHaveBeenCalledWith(mockBookId, {
      status: "enriched",
    });
  });

  // 8.8 Test failure handling (returns failure result, no status change)
  it("should return failure if book not found", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue(null);

    const result = await enrichFromMyAnimeList(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Book not found");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should return failure if no matching manga found on MAL", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Nonexistent Manga",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([]);

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No matching manga found on MyAnimeList");
    expect(bookService.updateBook).not.toHaveBeenCalled();
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mal-no-match",
      {},
    );
  });

  it("should handle API errors gracefully and return failure result", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockRejectedValue(
      new Error("Network Error"),
    );

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network Error");
    expect(bookService.updateBook).not.toHaveBeenCalled();
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.objectContaining({ source: "myanimelist" }),
    );
  });

  // 8.9 Test skips ebooks (content_type !== 'manga')
  it("should skip enrichment for ebooks (content_type !== 'manga')", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Regular Book",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a manga");
    expect(malClient.searchManga).not.toHaveBeenCalled();
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  // 8.10 Test skips when MAL_CLIENT_ID is not configured
  it("should skip enrichment when MAL_CLIENT_ID is not configured", async () => {
    // Set clientId to empty string
    mocks.malConfig.clientId = "";

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("MAL_CLIENT_ID not configured");
    expect(bookService.getBookById).not.toHaveBeenCalled();
    expect(malClient.searchManga).not.toHaveBeenCalled();
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  // 8.11 Test WebSocket events emitted during enrichment
  it("should emit mal-search-started event when enrichment begins", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "Test Manga",
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromMyAnimeList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mal-search-started",
      { title: "Test Manga" },
    );
  });

  it("should emit mal-match-found event when match is found", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 12345,
      title: "Test Manga Title",
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromMyAnimeList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mal-match-found",
      {
        matchTitle: "Test Manga Title",
        matchId: 12345,
      },
    );
  });

  it("should emit enrichment-completed event on success", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "Test Manga",
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromMyAnimeList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-completed",
      expect.objectContaining({
        source: "myanimelist",
        fieldsUpdated: expect.any(Array),
      }),
    );
  });

  it("should emit enrichment-failed event on error", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockRejectedValue(
      new Error("API Error"),
    );

    await enrichFromMyAnimeList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.objectContaining({
        source: "myanimelist",
        error: expect.stringContaining("API Error"),
      }),
    );
  });

  // Additional test: Verify best match selection with scoring
  it("should select best match based on title similarity and metadata", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
    };

    const mockMalManga1: MalMangaNode = {
      id: 13,
      title: "One Piece",
      alternative_titles: {
        synonyms: [],
        en: "One Piece",
        ja: "ワンピース",
      },
      synopsis: "Pirates adventure",
      genres: [{ id: 1, name: "Action" }],
      media_type: "manga",
      status: "publishing",
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: {
        medium: "https://example.com/cover.jpg",
        large: "https://example.com/cover-l.jpg",
      },
      start_date: null,
    };

    const mockMalManga2: MalMangaNode = {
      id: 999,
      title: "One Piece: Strong World",
      alternative_titles: null,
      synopsis: null,
      genres: [],
      media_type: "novel",
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([
      mockMalManga2,
      mockMalManga1,
    ]);
    vi.mocked(malClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(true);
    // Should select mockMalManga1 due to better match (exact title, manga type, has synopsis and cover)
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mal-match-found",
      {
        matchTitle: "One Piece",
        matchId: 13,
      },
    );
  });

  // Additional test: Verify low similarity score rejection
  it("should reject matches with similarity score below threshold", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "AAAA BBBB CCCC",
      author: null,
    };

    const mockMalManga: MalMangaNode = {
      id: 1,
      title: "XXXX YYYY ZZZZ",
      alternative_titles: null,
      synopsis: null,
      genres: [],
      media_type: "novel", // Not "manga" to avoid +10 bonus
      status: null,
      num_volumes: 0,
      num_chapters: 0,
      authors: [],
      main_picture: null,
      start_date: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(malClient.searchManga).mockResolvedValue([mockMalManga]);

    const result = await enrichFromMyAnimeList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No sufficiently similar match found on MyAnimeList");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });
});
