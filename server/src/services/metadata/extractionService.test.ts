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
import {
  emitEnrichmentStarted,
  emitEnrichmentProgress,
  emitEnrichmentCompleted,
} from "../../websocket/event";

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
    // Verify book status updated to "enriched" (Task 4.4)
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
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

    // Vérification de la séquence d'événements (Task 5.3 — distinct types)
    expect(emitEnrichmentStarted).toHaveBeenCalledWith(
      mockBookId,
      expect.any(Object),
    );
    expect(emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "metadata-extracted",
      expect.any(Object),
    );
    expect(emitEnrichmentCompleted).toHaveBeenCalledWith(
      mockBookId,
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
    // Cover update + status update to "enriched"
    expect(updateBook).toHaveBeenCalledTimes(2);
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
      cover_path: "covers/1.jpg",
    });
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
      status: "enriched",
    });
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

    // Vérifie update status enriched (Task 4.4)
    expect(updateBook).toHaveBeenCalledWith(mockBookId, {
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

    expect(emitEnrichmentStarted).toHaveBeenCalledWith(mockBookId, {
      fileType: "cbz",
    });

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

    expect(emitEnrichmentCompleted).toHaveBeenCalledWith(mockBookId, {
      metadataExtracted: true,
      coverExtracted: false,
    });
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
