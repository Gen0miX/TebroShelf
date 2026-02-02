import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyMetadata } from "./metadataApplyService";
import { updateBook } from "../library/bookService";
import { downloadCover } from "./coverDownloader";

vi.mock("../library/bookService", () => ({
  updateBook: vi.fn(),
}));

vi.mock("./coverDownloader", () => ({
  downloadCover: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("metadataApplyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply basic metadata fields and update the book", async () => {
    const bookId = 123;
    const metadata = {
      title: "New Title",
      author: "New Author",
      description: "New Description",
      publicationDate: "2023-01-01",
    };

    const result = await applyMetadata(bookId, metadata);

    expect(updateBook).toHaveBeenCalledWith(bookId, {
      title: "New Title",
      author: "New Author",
      description: "New Description",
      publication_date: "2023-01-01",
    });

    expect(result).toEqual({
      bookId: 123,
      fieldsUpdated: ["title", "author", "description", "publication_date"],
      coverDownloaded: false,
    });
  });

  it("should handle cover download if coverUrl is provided", async () => {
    const bookId = 123;
    const metadata = {
      title: "Title",
      coverUrl: "http://example.com/cover.jpg",
    };

    vi.mocked(downloadCover).mockResolvedValue("covers/123.jpg");

    const result = await applyMetadata(bookId, metadata);

    expect(downloadCover).toHaveBeenCalledWith("http://example.com/cover.jpg", bookId);
    expect(updateBook).toHaveBeenCalledWith(bookId, {
      title: "Title",
      cover_path: "covers/123.jpg",
    });

    expect(result.coverDownloaded).toBe(true);
    expect(result.fieldsUpdated).toContain("cover_path");
  });

  it("should handle cover download failure gracefully", async () => {
    const bookId = 123;
    const metadata = {
      title: "Title",
      coverUrl: "http://example.com/cover.jpg",
    };

    vi.mocked(downloadCover).mockResolvedValue(null);

    const result = await applyMetadata(bookId, metadata);

    expect(downloadCover).toHaveBeenCalled();
    expect(updateBook).toHaveBeenCalledWith(bookId, {
      title: "Title",
    });

    expect(result.coverDownloaded).toBe(false);
    expect(result.fieldsUpdated).not.toContain("cover_path");
  });

  it("should map all metadata fields correctly to snake_case", async () => {
    const bookId = 1;
    const metadata = {
      title: "T",
      author: "A",
      description: "D",
      genres: ["G1", "G2"],
      publicationDate: "P",
      publisher: "PB",
      isbn: "I",
      language: "L",
      series: "S",
      volume: 5,
    };

    await applyMetadata(bookId, metadata);

    expect(updateBook).toHaveBeenCalledWith(bookId, {
      title: "T",
      author: "A",
      description: "D",
      genres: ["G1", "G2"],
      publication_date: "P",
      publisher: "PB",
      isbn: "I",
      language: "L",
      series: "S",
      volume: 5,
    });
  });

  it("should not update book if no fields are provided (though validation should prevent this)", async () => {
      const bookId = 1;
      // @ts-ignore
      await applyMetadata(bookId, {});
      expect(updateBook).not.toHaveBeenCalled();
  });
});
