import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichFromOpenLibrary } from "./openLibraryEnrichment";
import * as bookService from "../../library/bookService";
import * as openLibraryClient from "../sources/openLibraryClient";
import * as coverDownloader from "../coverDownloader";
import * as wsEvent from "../../../websocket/event";

// Mocks des dépendances
vi.mock("../../library/bookService");
vi.mock("../sources/openLibraryClient");
vi.mock("../coverDownloader");
vi.mock("../../../websocket/event");
vi.mock("../../../utils/logger");

describe("OpenLibrary Enrichment Service", () => {
  const mockBookId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 8.2 Correction : On donne un livre SANS titre et SANS auteur au départ
  it("should enrich all fields when API returns full metadata", async () => {
    // On donne au moins un ISBN pour que le service déclenche la recherche
    const bookToEnrich = {
      id: mockBookId,
      content_type: "book",
      isbn: "1234567890",
      title: null,
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(bookToEnrich as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "New Title",
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "New Title",
      author: "Author Name",
      description: "Summary",
    } as any);

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain("title");
    expect(result.fieldsUpdated).toContain("author");
  });

  it("should only update missing fields and not overwrite existing ones", async () => {
    // Ici on teste la recherche par titre (car pas d'ISBN)
    const partialBook = {
      id: mockBookId,
      content_type: "book",
      title: "Existing Title",
      author: null,
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(partialBook as any);

    // On mock le résultat de recherche par titre
    const mockApiResult = {
      title: "Existing Title",
      author_name: ["New Author"],
    };
    vi.mocked(openLibraryClient.searchByTitle).mockResolvedValue([
      mockApiResult,
    ] as any);

    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Existing Title",
      author: "New Author",
    } as any);

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).not.toContain("title");
    expect(result.fieldsUpdated).toContain("author");
  });

  // 8.4 Test ISBN search priority
  it("should prioritize ISBN search and skip title search if found", async () => {
    const mockBook = {
      id: mockBookId,
      title: "Original Title",
      isbn: "1234567890",
      content_type: "book",
      cover_path: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Found by ISBN",
    } as any);

    await enrichFromOpenLibrary(mockBookId);

    expect(openLibraryClient.searchByISBN).toHaveBeenCalledWith(mockBook.isbn);
    expect(openLibraryClient.searchByTitle).not.toHaveBeenCalled();
  });

  // 8.5 Test cover download integration
  it("should download and update cover if metadata has cover_i and book has no cover", async () => {
    const mockBook = {
      id: mockBookId,
      title: "Original Title",
      isbn: "1234567890",
      content_type: "book",
      cover_path: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Title",
      cover_i: 999,
    } as any);
    vi.mocked(openLibraryClient.getCoverUrl).mockReturnValue(
      "http://image.url",
    );
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Title",
    } as any);

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(coverDownloader.downloadCover).toHaveBeenCalledWith(
      "http://image.url",
      mockBookId,
    );
    expect(result.coverUpdated).toBe(true);
    expect(vi.mocked(bookService.updateBook)).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        cover_path: "covers/1.jpg",
      }),
    );
  });

  // 8.6 & 8.7 Error handling and status
  it("should return failure result and not change status if book not found", async () => {
    vi.mocked(bookService.getBookById).mockResolvedValue(null);

    const result = await enrichFromOpenLibrary(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Book not found");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should handle API errors gracefully and emit failure event", async () => {
    const mockBook = {
      id: mockBookId,
      title: "Original Title",
      isbn: "1234567890",
      content_type: "book",
      cover_path: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockRejectedValue(
      new Error("API Down"),
    );

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("API Down");
    // C3: Verify failure WebSocket event is emitted
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-failed",
      expect.objectContaining({ source: "openlibrary" }),
    );
  });

  // C2: Verify emitEnrichmentCompleted is used on success
  it("should emit enrichment.completed event on success", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      isbn: "1234567890",
      title: null,
      author: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Found",
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Found",
    } as any);

    await enrichFromOpenLibrary(mockBookId);

    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "enrichment-completed",
      expect.objectContaining({ source: "openlibrary" }),
    );
  });

  // H1: Description fetched from Works API
  it("should fetch description from Works API when match has key", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      isbn: "123",
      title: null,
      author: null,
      description: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      key: "/works/OL123W",
      title: "Test",
    } as any);
    vi.mocked(openLibraryClient.fetchWorkDescription).mockResolvedValue(
      "A fascinating book.",
    );
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Test",
    } as any);

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(openLibraryClient.fetchWorkDescription).toHaveBeenCalledWith(
      "/works/OL123W",
    );
    expect(result.fieldsUpdated).toContain("description");
  });

  // H2: Replace low-quality cover
  it("should replace low-quality existing cover", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      isbn: "123",
      title: "Title",
      cover_path: "covers/1.jpg",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Title",
      cover_i: 999,
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Title",
    } as any);
    vi.mocked(openLibraryClient.getCoverUrl).mockReturnValue("http://img.url");
    vi.mocked(coverDownloader.isCoverLowQuality).mockResolvedValue(true);
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/1.jpg");

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(coverDownloader.isCoverLowQuality).toHaveBeenCalledWith(
      "covers/1.jpg",
    );
    expect(coverDownloader.downloadCover).toHaveBeenCalled();
    expect(result.coverUpdated).toBe(true);
  });

  // H2: Do NOT replace high-quality existing cover
  it("should not replace high-quality existing cover", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      isbn: "123",
      title: "Title",
      cover_path: "covers/1.jpg",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Title",
      cover_i: 999,
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Title",
    } as any);
    vi.mocked(coverDownloader.isCoverLowQuality).mockResolvedValue(false);

    const result = await enrichFromOpenLibrary(mockBookId);

    expect(coverDownloader.downloadCover).not.toHaveBeenCalled();
    expect(result.coverUpdated).toBe(false);
  });
});
