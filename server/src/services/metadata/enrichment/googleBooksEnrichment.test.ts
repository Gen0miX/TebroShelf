import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichFromGoogleBooks } from "./googleBooksEnrichment";
import * as bookService from "../../library/bookService";
import * as googleBooksClient from "../sources/googleBooksClient";
import * as coverDownloader from "../coverDownloader";
import * as wsEvent from "../../../websocket/event";

// Mock dependencies
vi.mock("../../library/bookService");
vi.mock("../sources/googleBooksClient");
vi.mock("../coverDownloader");
vi.mock("../../../websocket/event");
vi.mock("../../../utils/logger");

describe("Google Books Enrichment Service", () => {
  const mockBookId = 1;
  const mockBook = {
    id: mockBookId,
    content_type: "book",
    isbn: "1234567890",
    title: null,
    author: null,
    cover_path: null,
  };

  const mockGoogleVolume = {
    id: "vol1",
    volumeInfo: {
      title: "Google Title",
      authors: ["Google Author"],
      imageLinks: { thumbnail: "http://cover.jpg" },
    },
  };

  const mockMetadata = {
    title: "Google Title",
    author: "Google Author",
    description: "Description",
    genres: ["Genre"],
    isbn: "1234567890",
    publication_date: "2023-01-01",
    publisher: "Publisher",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks for happy path
    vi.mocked(googleBooksClient.isConfigured).mockReturnValue(true);
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(googleBooksClient.searchByISBN).mockResolvedValue(mockGoogleVolume as any);
    vi.mocked(googleBooksClient.mapToBookMetadata).mockReturnValue(mockMetadata as any);
    vi.mocked(googleBooksClient.getCoverUrl).mockReturnValue("http://cover.url");
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue("covers/123.jpg");
  });

  // 7.2 Test successful enrichment with all fields populated
  it("should enrich all fields when API returns full metadata", async () => {
    const result = await enrichFromGoogleBooks(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain("title");
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).toContain("description");
    expect(result.fieldsUpdated).toContain("genres");
    expect(result.fieldsUpdated).toContain("publisher");
    expect(result.fieldsUpdated).toContain("publication_date");
    expect(result.coverUpdated).toBe(true);

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        title: "Google Title",
        author: "Google Author",
        status: "enriched",
        cover_path: "covers/123.jpg",
      })
    );
  });

  // 7.3 Test partial enrichment (some fields missing from API or already present)
  it("should only update missing fields and not overwrite existing ones", async () => {
    const partialBook = {
      ...mockBook,
      title: "Existing Title",
      author: null,
      description: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(partialBook as any);

    // Metadata has title, author, description
    vi.mocked(googleBooksClient.mapToBookMetadata).mockReturnValue({
      title: "New Google Title", // Should be ignored
      author: "New Google Author", // Should be used
      description: "New Description", // Should be used
    } as any);

    const result = await enrichFromGoogleBooks(mockBookId);

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).not.toContain("title");
    expect(result.fieldsUpdated).toContain("author");
    expect(result.fieldsUpdated).toContain("description");

    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        author: "New Google Author",
        description: "New Description",
        status: "enriched",
      })
    );
    // Ensure title was NOT in the update payload
    const updateCall = vi.mocked(bookService.updateBook).mock.calls[0][1];
    expect(updateCall).not.toHaveProperty("title");
  });

  // 7.4 Test ISBN search priority over title search
  it("should prioritize ISBN search and skip title search if found", async () => {
    await enrichFromGoogleBooks(mockBookId);

    expect(googleBooksClient.searchByISBN).toHaveBeenCalledWith(mockBook.isbn);
    expect(googleBooksClient.searchByTitle).not.toHaveBeenCalled();
  });

  it("should fall back to title search if ISBN search yields no results", async () => {
    const bookWithoutISBNMatch = { ...mockBook, title: "Google Title" };
    vi.mocked(bookService.getBookById).mockResolvedValue(bookWithoutISBNMatch as any);

    // ISBN returns null
    vi.mocked(googleBooksClient.searchByISBN).mockResolvedValue(null);
    // Title search returns results with matching title
    vi.mocked(googleBooksClient.searchByTitle).mockResolvedValue([mockGoogleVolume as any]);

    await enrichFromGoogleBooks(mockBookId);

    expect(googleBooksClient.searchByISBN).toHaveBeenCalled();
    expect(googleBooksClient.searchByTitle).toHaveBeenCalledWith("Google Title", undefined);

    // Should invoke update since we found a matching title via fallback
    expect(bookService.updateBook).toHaveBeenCalled();
  });

  // 7.5 Test cover download integration
  it("should download cover if available and missing in book", async () => {
    await enrichFromGoogleBooks(mockBookId);
    expect(googleBooksClient.getCoverUrl).toHaveBeenCalled();
    expect(coverDownloader.downloadCover).toHaveBeenCalledWith("http://cover.url", mockBookId);
  });

  it("should skip cover download if book already has cover", async () => {
    const bookWithCover = { ...mockBook, cover_path: "existing/cover.jpg" };
    vi.mocked(bookService.getBookById).mockResolvedValue(bookWithCover as any);

    const result = await enrichFromGoogleBooks(mockBookId);

    expect(coverDownloader.downloadCover).not.toHaveBeenCalled();
    expect(result.coverUpdated).toBe(false);
  });

  // 7.6 Test status update to 'enriched' on success
  it("should update status to enriched", async () => {
    await enrichFromGoogleBooks(mockBookId);
    expect(bookService.updateBook).toHaveBeenCalledWith(
        mockBookId,
        expect.objectContaining({ status: "enriched" })
    );
  });

  // 7.7 Test failure handling
  it("should return failure if API key is not configured", async () => {
    vi.mocked(googleBooksClient.isConfigured).mockReturnValue(false);

    const result = await enrichFromGoogleBooks(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("API key not configured");
    expect(bookService.updateBook).not.toHaveBeenCalled();
  });

  it("should return failure if search returns no matches", async () => {
    vi.mocked(googleBooksClient.searchByISBN).mockResolvedValue(null);
    vi.mocked(googleBooksClient.searchByTitle).mockResolvedValue([]);

    const result = await enrichFromGoogleBooks(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching book found");
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(mockBookId, "googlebooks-no-match", {});
  });

  it("should handle exceptions and return failure result", async () => {
    vi.mocked(googleBooksClient.searchByISBN).mockRejectedValue(new Error("Network Error"));

    const result = await enrichFromGoogleBooks(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network Error");
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
        mockBookId, 
        "enrichment-failed", 
        expect.objectContaining({ source: "googlebooks" })
    );
  });
});
