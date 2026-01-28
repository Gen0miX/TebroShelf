import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processEpubExtraction,
  processComicExtraction,
} from "./extractionService";
import { getBookById, updateBook } from "../library/bookService";
import {
  extractEpubMetadata,
  extractEpubCover,
} from "./extractors/epubExtractor";
import {
  extractComicMetadata,
  extractComicCover,
} from "./extractors/comicExtractor";
import { emitEnrichmentProgress } from "../../websocket/event";

// 1. On mock toutes les dépendances
vi.mock("../library/bookService");
vi.mock("./extractors/epubExtractor");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");
vi.mock("./extractors/comicExtractor");

describe("extractionService", () => {
  const mockBookId = 1;
  const mockBook = {
    id: mockBookId,
    file_path: "/path/to/book.epub",
    file_type: "epub",
    title: "Original Title",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 9.2 & 9.4 : Test du flux complet et mise à jour BDD
  it("should perform full extraction flow and update the book record", async () => {
    // Configuration des retours de mocks
    vi.mocked(getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(extractEpubMetadata).mockResolvedValue({
      title: "Extracted Title",
      author: "New Author",
      description: null,
      publisher: "Test Publisher",
      language: "en",
      isbn: null,
      genres: null,
      publication_date: null,
    });
    vi.mocked(extractEpubCover).mockResolvedValue({
      coverPath: "covers/1.jpg",
    });

    const result = await processEpubExtraction(mockBookId);

    // Vérifications du résultat final
    expect(result.success).toBe(true);
    expect(result.metadataExtracted).toBe(true);
    expect(result.coverExtracted).toBe(true);

    // Vérification des mises à jour en base de données (Task 9.4)
    expect(updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        title: "Extracted Title",
        author: "New Author",
        publisher: "Test Publisher",
        language: "en",
      }),
    );
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
      cover_path: "covers/1.jpg",
    });
    // Verify book status is NOT updated to "enriched" (Task 8.2)
    expect(updateBook).not.toHaveBeenCalledWith(mockBookId, {
      status: "enriched",
    });
  });

  // 9.3 : Test des événements WebSocket
  it("should emit WebSocket events during the process", async () => {
    vi.mocked(getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(extractEpubMetadata).mockResolvedValue({
      title: "Title",
      author: null,
      description: null,
      publisher: null,
      language: null,
      isbn: null,
      genres: null,
      publication_date: null,
    });
    vi.mocked(extractEpubCover).mockResolvedValue({ coverPath: null });

    await processEpubExtraction(mockBookId);

    // Extraction service only emits progress events (lifecycle events managed by orchestrator)
    expect(emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "metadata-extracted",
      expect.any(Object),
    );
  });

  it("should handle failure when book is not found", async () => {
    vi.mocked(getBookById).mockResolvedValue(null);

    const result = await processEpubExtraction(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Book not found");
    expect(extractEpubMetadata).not.toBeCalled();
  });

  it("should handle partial success (metadata fails, cover succeeds)", async () => {
    vi.mocked(getBookById).mockResolvedValue(mockBook as any);
    // Simulation d'un échec d'extraction de métadonnées
    vi.mocked(extractEpubMetadata).mockRejectedValue(
      new Error("Parsing error"),
    );
    vi.mocked(extractEpubCover).mockResolvedValue({
      coverPath: "covers/1.jpg",
    });

    const result = await processEpubExtraction(mockBookId);

    expect(result.metadataExtracted).toBe(false);
    expect(result.coverExtracted).toBe(true);
    expect(result.success).toBe(true);
    // Cover update only (Task 8.2)
    expect(updateBook).toHaveBeenCalledTimes(1);
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
      cover_path: "covers/1.jpg",
    });
  });

  it("should handle total failure (both metadata and cover fail)", async () => {
    vi.mocked(getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(extractEpubMetadata).mockRejectedValue(new Error("Metadata fail"));
    vi.mocked(extractEpubCover).mockRejectedValue(new Error("Cover fail"));

    const result = await processEpubExtraction(mockBookId);

    expect(result.success).toBe(false);
    expect(result.metadataExtracted).toBe(false);
    expect(result.coverExtracted).toBe(false);
    expect(updateBook).not.toHaveBeenCalled();
  });
});

describe("comic extraction integration", () => {
  const mockBookId = 42;

  const mockComicBook = {
    id: mockBookId,
    file_path: "/path/to/comic.cbz",
    file_type: "cbz",
    title: "Original Comic",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 8.2 + 8.4 Full flow + DB update
  it("should perform full comic extraction flow and update book record", async () => {
    vi.mocked(getBookById).mockResolvedValue(mockComicBook as any);

    vi.mocked(extractComicMetadata).mockResolvedValue({
      title: "Batman",
      author: "Bob Kane",
      description: "Dark Knight",
      series: "DC",
      volume: 5,
      genres: ["Action", "Superhero"],
      publication_date: "1940-01-01",
    });

    vi.mocked(extractComicCover).mockResolvedValue({
      coverPath: "covers/42.jpg",
    });

    const result = await processComicExtraction(mockBookId);

    // Résultat global
    expect(result.success).toBe(true);
    expect(result.metadataExtracted).toBe(true);
    expect(result.coverExtracted).toBe(true);

    // Vérifie update metadata
    expect(updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        title: "Batman",
        author: "Bob Kane",
        description: "Dark Knight",
        series: "DC",
        volume: 5,
        publication_date: "1940-01-01",
        // genres stockés en JSON string
        genres: JSON.stringify(["Action", "Superhero"]),
      }),
    );

    // Vérifie update cover
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
      cover_path: "covers/42.jpg",
    });

    // Verify book status remains unchanged (Task 8.3)
    expect(updateBook).not.toHaveBeenCalledWith(mockBookId, {
      status: "enriched",
    });
  });

  // 8.3 WebSocket events
  it("should emit websocket events during comic extraction", async () => {
    vi.mocked(getBookById).mockResolvedValue(mockComicBook as any);

    vi.mocked(extractComicMetadata).mockResolvedValue({
      title: "Batman",
    } as any);

    vi.mocked(extractComicCover).mockResolvedValue({
      coverPath: null,
    });

    await processComicExtraction(mockBookId);

    // Extraction service only emits progress events (lifecycle events managed by orchestrator)
    expect(emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "metadata-extracted",
      expect.any(Object),
    );

    // AC #7: enrichment.progress with step "extraction-complete"
    expect(emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "extraction-complete",
      expect.any(Object),
    );
  });

  // Bonus robustesse : livre absent
  it("should handle comic book not found", async () => {
    vi.mocked(getBookById).mockResolvedValue(null);

    const result = await processComicExtraction(mockBookId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Book not found");
    expect(extractComicMetadata).not.toHaveBeenCalled();
  });
});
