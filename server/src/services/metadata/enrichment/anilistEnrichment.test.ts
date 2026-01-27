import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enrichFromAniList,
  selectBestMatch,
} from "./anilistEnrichment";
import { cleanTitle, normalizeString, calculateSimilarity } from "../utils/metadataUtils";
import * as bookService from "../../library/bookService";
import * as anilistClient from "../sources/anilistClient";
import * as coverDownloader from "../coverDownloader";
import * as wsEvent from "../../../websocket/event";
import type { AniListMedia } from "../sources/anilistClient";

// Mock dependencies
vi.mock("../../library/bookService");
vi.mock("../sources/anilistClient");
vi.mock("../coverDownloader");
vi.mock("../../../websocket/event");
vi.mock("../../../utils/logger");

describe("AniList Enrichment Service", () => {
  const mockBookId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
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

    const mockAniListMedia: AniListMedia = {
      id: 30013,
      title: {
        romaji: "Berserk",
        english: "Berserk",
        native: "ベルセルク",
      },
      description: "A dark fantasy story about a lone mercenary.",
      genres: ["Action", "Adventure", "Drama", "Fantasy", "Horror"],
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Berserk",
      author: "Kentarou Miura",
      description: "A dark fantasy story about a lone mercenary.",
      genres: ["Action", "Adventure", "Drama", "Fantasy", "Horror"],
      publication_date: "1989-08-25",
    });
    vi.mocked(anilistClient.getCoverUrl).mockReturnValue(
      "https://example.com/cover-xl.jpg",
    );
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(true);
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
        description: "A dark fantasy story about a lone mercenary.",
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

    const mockAniListMedia: AniListMedia = {
      id: 1,
      title: {
        romaji: "New Title",
        english: null,
        native: null,
      },
      description: "New Description",
      genres: ["Action", "Adventure"],
      coverImage: null,
      status: null,
      volumes: null,
      chapters: null,
      format: null,
      staff: {
        edges: [
          {
            role: "Story",
            node: {
              name: {
                full: "New Author",
                native: null,
              },
            },
          },
        ],
      },
      startDate: null,
      synonyms: [],
      averageScore: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(partialBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "New Title",
      author: "New Author",
      description: "New Description",
      genres: ["Action", "Adventure"],
    });

    const result = await enrichFromAniList(mockBookId);

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

  // 8.4 Test title matching across romaji/english/native variants
  it("should match title using romaji variant", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Shingeki no Kyojin",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 53390,
      title: {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: "進撃の巨人",
      },
      description: "Titans attack humanity.",
      genres: ["Action"],
      coverImage: null,
      status: null,
      volumes: null,
      chapters: null,
      format: "MANGA",
      staff: null,
      startDate: null,
      synonyms: [],
      averageScore: 85,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
      author: "Hajime Isayama",
    });

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(true);
    expect(anilistClient.searchManga).toHaveBeenCalled();
  });

  it("should match title using english variant", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Attack on Titan",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 53390,
      title: {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: "進撃の巨人",
      },
      description: "Titans attack humanity.",
      genres: ["Action"],
      coverImage: null,
      status: null,
      volumes: null,
      chapters: null,
      format: "MANGA",
      staff: null,
      startDate: null,
      synonyms: [],
      averageScore: 85,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
      author: "Hajime Isayama",
    });

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(true);
  });

  it("should match title using native variant", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "進撃の巨人",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 53390,
      title: {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: "進撃の巨人",
      },
      description: "Titans attack humanity.",
      genres: ["Action"],
      coverImage: null,
      status: null,
      volumes: null,
      chapters: null,
      format: "MANGA",
      staff: null,
      startDate: null,
      synonyms: [],
      averageScore: 85,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Attack on Titan",
      author: "Hajime Isayama",
    });

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(true);
  });

  // 8.5 Test cover download integration
  it("should download cover if available and missing in book", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
      cover_path: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 30013,
      title: {
        romaji: "One Piece",
        english: "One Piece",
        native: "ワンピース",
      },
      description: "Pirates adventure.",
      genres: ["Action", "Adventure"],
      coverImage: {
        extraLarge: "https://example.com/cover-xl.jpg",
        large: "https://example.com/cover-l.jpg",
        medium: "https://example.com/cover-m.jpg",
        color: "#ff0000",
      },
      status: null,
      volumes: null,
      chapters: null,
      format: null,
      staff: null,
      startDate: null,
      synonyms: [],
      averageScore: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });
    vi.mocked(anilistClient.getCoverUrl).mockReturnValue(
      "https://example.com/cover-xl.jpg",
    );
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromAniList(mockBookId);

    expect(anilistClient.getCoverUrl).toHaveBeenCalledWith(
      mockAniListMedia.coverImage,
    );
    expect(coverDownloader.downloadCover).toHaveBeenCalledWith(
      "https://example.com/cover-xl.jpg",
      mockBookId,
    );
    expect(result.coverUpdated).toBe(true);
  });

  it("should skip cover download if book already has cover", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "One Piece",
      author: null,
      cover_path: "covers/existing.jpg",
    };

    const mockAniListMedia: AniListMedia = {
      id: 30013,
      title: {
        romaji: "One Piece",
        english: null,
        native: null,
      },
      description: null,
      genres: [],
      coverImage: {
        extraLarge: "https://example.com/cover-xl.jpg",
        large: null,
        medium: null,
        color: null,
      },
      status: null,
      volumes: null,
      chapters: null,
      format: null,
      staff: null,
      startDate: null,
      synonyms: [],
      averageScore: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "One Piece",
    });

    const result = await enrichFromAniList(mockBookId);

    expect(coverDownloader.downloadCover).not.toHaveBeenCalled();
    expect(result.coverUpdated).toBe(false);
  });

  // 8.6 Test status update to 'enriched' on success
  it("should update status to enriched on success", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 1,
      title: {
        romaji: "Test Manga",
        english: null,
        native: null,
      },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromAniList(mockBookId);

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
      genres: ["Genre1"],
      publication_date: "2020-01-01",
    };

    const mockAniListMedia: AniListMedia = {
      id: 1,
      title: {
        romaji: "Existing Title",
        english: null,
        native: null,
      },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Existing Title",
    });

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated.length).toBe(0);
    expect(bookService.updateBook).toHaveBeenCalledWith(mockBookId, {
      status: "enriched",
    });
  });

  // 8.7 Test failure handling (returns failure result, no status change)
  it("should return failure if book not found", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue(null);

    const result = await enrichFromAniList(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Book not found");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should return failure if no matching manga found on AniList", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Nonexistent Manga",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([]);

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No matching manga found on AniList");
    expect(bookService.updateBook).not.toHaveBeenCalled();
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "anilist-no-match",
      { title: "Nonexistent Manga" },
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
    vi.mocked(anilistClient.searchManga).mockRejectedValue(
      new Error("Network Error"),
    );

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network Error");
    expect(bookService.updateBook).not.toHaveBeenCalled();
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.objectContaining({ source: "anilist" }),
    );
  });

  // 8.8 Test skips ebooks (content_type !== 'manga')
  it("should skip enrichment for ebooks (content_type !== 'manga')", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Regular Book",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    const result = await enrichFromAniList(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a manga (use ebook enrichment for books)");
    expect(anilistClient.searchManga).not.toHaveBeenCalled();
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  // 8.9 Test WebSocket events emitted during enrichment
  it("should emit enrichment.started event when enrichment begins", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 1,
      title: {
        romaji: "Test Manga",
        english: null,
        native: null,
      },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromAniList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "anilist-search-started",
      {
        source: "anilist",
        title: "Test Manga",
      },
    );
  });

  it("should emit enrichment.progress event when match is found", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 12345,
      title: {
        romaji: "Test Manga",
        english: "Test Manga English",
        native: "テスト",
      },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromAniList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "anilist-match-found",
      {
        matchTitle: "Test Manga English",
        matchId: 12345,
      },
    );
  });

  it("should emit enrichment.completed event on success", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    const mockAniListMedia: AniListMedia = {
      id: 1,
      title: {
        romaji: "Test Manga",
        english: null,
        native: null,
      },
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
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockResolvedValue([mockAniListMedia]);
    vi.mocked(anilistClient.mapToBookMetadata).mockReturnValue({
      title: "Test Manga",
    });

    await enrichFromAniList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-completed",
      expect.objectContaining({
        source: "anilist",
        fieldsUpdated: expect.any(Array),
      }),
    );
  });

  it("should emit enrichment.progress event with failure on error", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "manga",
      title: "Test Manga",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(anilistClient.searchManga).mockRejectedValue(
      new Error("API Error"),
    );

    await enrichFromAniList(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.objectContaining({
        source: "anilist",
        error: expect.stringContaining("API Error"),
      }),
    );
  });
});

// =======================
// cleanTitle tests
// =======================
describe("cleanTitle", () => {
  it("should remove volume numbers (Vol. 45)", () => {
    expect(cleanTitle("One Piece Vol. 45")).toBe("One Piece");
  });

  it("should remove short volume notation (v12)", () => {
    expect(cleanTitle("Naruto v12")).toBe("Naruto");
  });

  it("should remove full 'Volume' word", () => {
    expect(cleanTitle("Berserk Volume 1")).toBe("Berserk");
  });

  it("should remove French tome numbers (Tome 3)", () => {
    expect(cleanTitle("Dragon Ball Tome 3")).toBe("Dragon Ball");
  });

  it("should remove short French tome (t5)", () => {
    expect(cleanTitle("Bleach t5")).toBe("Bleach");
  });

  it("should remove bracketed content", () => {
    expect(cleanTitle("[Scan] Dragon Ball [Digital]")).toBe("Dragon Ball");
  });

  it("should remove parenthesized content", () => {
    expect(cleanTitle("Attack on Titan (2013)")).toBe("Attack on Titan");
  });

  it("should collapse whitespace", () => {
    expect(cleanTitle("  One   Piece   ")).toBe("One Piece");
  });

  it("should handle combined patterns", () => {
    expect(cleanTitle("[HQ] Berserk Volume 1 (Digital) [Scan]")).toBe(
      "Berserk",
    );
  });

  it("should return plain title unchanged", () => {
    expect(cleanTitle("Berserk")).toBe("Berserk");
  });
});

// =======================
// normalizeString tests
// =======================
describe("normalizeString", () => {
  it("should lowercase and strip non-alphanumeric chars", () => {
    expect(normalizeString("One Piece!")).toBe("onepiece");
  });

  it("should remove Japanese characters", () => {
    expect(normalizeString("進撃の巨人")).toBe("");
  });

  it("should handle mixed content", () => {
    expect(normalizeString("Shingeki no Kyojin 進撃の巨人")).toBe(
      "shingekinokyojin",
    );
  });
});

// =======================
// calculateSimilarity tests
// =======================
describe("calculateSimilarity", () => {
  it("should return 100 for identical strings", () => {
    expect(calculateSimilarity("berserk", "berserk")).toBe(100);
  });

  it("should return 0 for empty strings", () => {
    expect(calculateSimilarity("", "berserk")).toBe(0);
    expect(calculateSimilarity("berserk", "")).toBe(0);
  });

  it("should return high score for similar strings", () => {
    const score = calculateSimilarity("onepiece", "onepiec");
    expect(score).toBeGreaterThan(80);
  });

  it("should return low score for very different strings", () => {
    const score = calculateSimilarity("xyz", "abcdefgh");
    expect(score).toBeLessThan(20);
  });
});

// =======================
// selectBestMatch tests
// =======================
describe("selectBestMatch", () => {
  const makeMedia = (
    overrides: Partial<AniListMedia> & { title: AniListMedia["title"] },
  ): AniListMedia => ({
    id: 1,
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
    ...overrides,
  });

  it("should return null for empty results", () => {
    expect(selectBestMatch([], "Berserk")).toBeNull();
  });

  it("should select exact english title match", () => {
    const media = makeMedia({
      id: 1,
      title: { romaji: "Kenpuu Denki Berserk", english: "Berserk", native: "ベルセルク" },
      format: "MANGA",
      averageScore: 93,
    });

    const result = selectBestMatch([media], "Berserk");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it("should reject results below minimum score threshold", () => {
    const media = makeMedia({
      id: 1,
      title: { romaji: "ZZZZZ", english: "XXXXX", native: null },
    });

    const result = selectBestMatch([media], "Berserk");
    expect(result).toBeNull();
  });

  it("should prefer MANGA format over NOVEL", () => {
    const manga = makeMedia({
      id: 1,
      title: { romaji: "Test Title", english: "Test Title", native: null },
      format: "MANGA",
      averageScore: 50,
    });
    const novel = makeMedia({
      id: 2,
      title: { romaji: "Test Title", english: "Test Title", native: null },
      format: "NOVEL",
      averageScore: 50,
    });

    const result = selectBestMatch([novel, manga], "Test Title");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it("should match via synonyms", () => {
    const media = makeMedia({
      id: 1,
      title: { romaji: "Shingeki no Kyojin", english: null, native: "進撃の巨人" },
      synonyms: ["Attack on Titan", "AoT"],
      format: "MANGA",
      averageScore: 85,
    });

    const result = selectBestMatch([media], "Attack on Titan");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });
});
