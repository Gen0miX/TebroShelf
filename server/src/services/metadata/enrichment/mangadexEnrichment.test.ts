import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichFromMangaDex } from "./mangadexEnrichment";
import * as bookService from "../../library/bookService";
import * as mangadexClient from "../sources/mangadexClient";
import * as coverDownloader from "../coverDownloader";
import * as wsEvent from "../../../websocket/event";
import type { MangaDexManga } from "../sources/mangadexClient";

// Mock dependencies
vi.mock("../../library/bookService");
vi.mock("../sources/mangadexClient");
vi.mock("../coverDownloader");
vi.mock("../../../websocket/event");
vi.mock("../../../utils/logger");

describe("MangaDex Enrichment Service", () => {
  const mockBookId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 7.2 Test successful enrichment with all fields populated
  it("should enrich all fields when API returns full metadata", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Berserk",
      author: null,
      description: null,
      genres: null,
      publication_date: null,
      publication_status: null,
      cover_path: null,
    };

    const mockManga: MangaDexManga = {
      id: "mangadex-id-1",
      type: "manga",
      attributes: {
        title: { en: "Berserk" },
        altTitles: [{ ja: "ベルセルク" }],
        description: { en: "Guts, a former mercenary..." },
        originalLanguage: "ja",
        status: "ongoing",
        publicationDemographic: "seinen",
        contentRating: "safe",
        tags: [
          {
            id: "tag-1",
            type: "tag",
            attributes: { name: { en: "Action" }, group: "genre" },
          },
        ],
        year: 1989,
        createdAt: "2021-01-01T00:00:00Z",
        updatedAt: "2021-01-01T00:00:00Z",
      },
      relationships: [
        { id: "author-1", type: "author", attributes: { name: "Kentarou Miura" } },
        { id: "cover-1", type: "cover_art", attributes: { fileName: "cover.jpg" } },
      ],
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([mockManga]);
    vi.mocked(mangadexClient.getLocalizedString).mockImplementation((obj) => obj?.en || obj?.ja || null);
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({
      title: "Berserk",
      author: "Kentarou Miura",
      description: "Guts, a former mercenary...",
      genres: ["Action"],
      publication_date: "1989",
      publication_status: "ongoing",
    });
    vi.mocked(mangadexClient.getCoverFileName).mockReturnValue("cover.jpg");
    vi.mocked(mangadexClient.buildCoverUrl).mockReturnValue("https://mangadex.org/covers/id/cover.jpg");
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(true);
    expect(result.source).toBe("mangadex");
    expect(result.fieldsUpdated).not.toContain("title"); // Already exists
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).toContain("description");
    expect(result.fieldsUpdated).toContain("genres");
    expect(result.fieldsUpdated).toContain("publication_date");
    expect(result.fieldsUpdated).toContain("publication_status");
    expect(result.fieldsUpdated).toContain("cover_path");
    expect(result.coverUpdated).toBe(true);

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        author: "Kentarou Miura",
        description: "Guts, a former mercenary...",
        publication_status: "ongoing",
        status: "enriched",
        cover_path: "covers/1.jpg",
      }),
    );
  });

  // 7.3 Test partial enrichment (some fields missing from API)
  it("should only update missing fields and not overwrite existing ones", async () => {
    const partialBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Existing Title",
      author: null,
      description: "Existing Description",
      genres: null,
      cover_path: "existing/cover.jpg",
    };

    const mockManga: MangaDexManga = {
      id: "2",
      type: "manga",
      attributes: {
        title: { en: "New Title" },
        altTitles: [],
        description: { en: "New Description" },
        tags: [],
        year: null,
      } as any,
      relationships: [
        { id: "a1", type: "author", attributes: { name: "New Author" } }
      ],
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(partialBook as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([mockManga]);
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({
      title: "New Title",
      author: "New Author",
      description: "New Description",
    });

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).not.toContain("title");
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).not.toContain("description");
    expect(result.fieldsUpdated).not.toContain("cover_path");

    const updateCall = vi.mocked(bookService.updateBook).mock.calls[0][1];
    expect(updateCall).not.toHaveProperty("title");
    expect(updateCall).not.toHaveProperty("description");
    expect(updateCall).toHaveProperty("author", "New Author");
  });

  // 7.4 Test title matching across localized variants and altTitles
  // This test is social (calls selectBestMatch internal function)
  it("should match title across multiple variants", async () => {
     const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Attack on Titan",
      author: null,
    };

    const mangaWithAltTitle: MangaDexManga = {
      id: "md-1",
      type: "manga",
      attributes: {
        title: { ja: "Shingeki no Kyojin" },
        altTitles: [{ en: "Attack on Titan" }],
        tags: [],
      } as any,
      relationships: [],
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([mangaWithAltTitle]);
    vi.mocked(mangadexClient.getLocalizedString).mockReturnValue("Attack on Titan");
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
    });

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(true);
    expect(mangadexClient.searchManga).toHaveBeenCalledWith("Attack on Titan");
  });

  // 7.5 Test cover download when cover is missing
  it("should download cover if book.cover_path is missing", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Cover Test",
      cover_path: null,
    };

    const mockManga: MangaDexManga = {
      id: "id-cover",
      attributes: {
        title: { en: "Cover Test" },
        altTitles: [],
        tags: [],
      },
      relationships: [{ type: "cover_art", attributes: { fileName: "img.jpg" } }],
    } as any;

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([mockManga]);
    vi.mocked(mangadexClient.getCoverFileName).mockReturnValue("img.jpg");
    vi.mocked(mangadexClient.buildCoverUrl).mockReturnValue("http://img.jpg");
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("new/path.jpg");
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({});
    vi.mocked(mangadexClient.getLocalizedString).mockReturnValue("Cover Test");

    await enrichFromMangaDex(mockBookId);

    expect(coverDownloader.downloadCover).toHaveBeenCalled();
  });

  // 7.6 Test cover NOT downloaded when cover already exists
  it("should NOT download cover if book.cover_path exists", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Cover Test",
      cover_path: "existing.jpg",
    };

    const mockManga: MangaDexManga = {
      id: "id-cover",
      attributes: {
        title: { en: "Cover Test" },
        altTitles: [],
        tags: [],
      },
      relationships: [{ type: "cover_art", attributes: { fileName: "img.jpg" } }],
    } as any;

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([mockManga]);
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({});
    vi.mocked(mangadexClient.getLocalizedString).mockReturnValue("Cover Test");

    await enrichFromMangaDex(mockBookId);

    expect(coverDownloader.downloadCover).not.toHaveBeenCalled();
  });

  // 7.7 Test status update to 'enriched' on success
  it("should update status to enriched on success", async () => {
     vi.mocked(bookService.getBookById).mockResolvedValue({
      id: mockBookId,
      content_type: "manga",
      title: "Test",
    } as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([{
      id: "1",
      attributes: { title: { en: "Test" }, tags: [] },
      relationships: []
    }] as any);
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({ title: "Test" });

    await enrichFromMangaDex(mockBookId);

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({ status: "enriched" })
    );
  });

  // 7.8 Test failure handling (returns failure result, no status change)
  it("should return failure if no match found", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue({
      id: mockBookId,
      content_type: "manga",
      title: "No Match",
    } as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([]);

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No matching manga found on MangaDex");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should return failure if API throws", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue({
      id: mockBookId,
      content_type: "manga",
      title: "Error",
    } as any);
    vi.mocked(mangadexClient.searchManga).mockRejectedValue(new Error("API Down"));

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("API Down");
  });

  // 7.9 Test skips ebooks (content_type !== 'manga')
  it("should skip if not a manga", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue({
      id: mockBookId,
      content_type: "book",
    } as any);

    const result = await enrichFromMangaDex(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a manga");
    expect(mangadexClient.searchManga).not.toHaveBeenCalled();
  });

  // 7.10 Test WebSocket events emitted during enrichment
  it("should emit progress events", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue({
      id: mockBookId,
      content_type: "manga",
      title: "Websocket Test",
    } as any);
    vi.mocked(mangadexClient.searchManga).mockResolvedValue([{
      id: "ws-1",
      attributes: { title: { en: "WS Match" }, tags: [] },
      relationships: []
    }] as any);
    vi.mocked(mangadexClient.mapToBookMetadata).mockReturnValue({ title: "WS Match" });
    vi.mocked(mangadexClient.getLocalizedString).mockReturnValue("WS Match");

    await enrichFromMangaDex(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mangadex-search-started",
      expect.any(Object)
    );
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "mangadex-match-found",
      expect.any(Object)
    );
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-completed",
      expect.any(Object)
    );
  });
});
