import { describe, it, expect, vi, beforeEach } from "vitest";
import { runEnrichmentPipeline } from "./enrichmentPipeline";
import * as bookService from "../library/bookService";
import * as openLibraryClient from "./sources/openLibraryClient";
import * as coverDownloader from "./coverDownloader";
import * as wsEvent from "../../websocket/event";

// On mocke les accès externes (API, DB, WS)
vi.mock("../library/bookService");
vi.mock("./sources/openLibraryClient");
vi.mock("./coverDownloader");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("Enrichment Pipeline Integration", () => {
  const mockBookId = 123;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 9.2 & 9.5 : Test du flux complet et mise à jour de l'enregistrement
  it("should run full flow: find book, enrich via OpenLibrary, and update record", async () => {
    // GIVEN: Un livre existant en BDD sans métadonnées
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Deep Work",
      isbn: "123",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // GIVEN: L'API OpenLibrary renvoie des infos
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Deep Work",
      cover_i: 456,
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Deep Work",
      author: "Cal Newport",
      description: "Focus in a distracted world",
    } as any);

    // WHEN: On lance le pipeline
    const result = await runEnrichmentPipeline(mockBookId);

    // THEN: Le pipeline est un succès
    expect(result.success).toBe(true);
    expect(result.source).toBe("openlibrary");

    // THEN: La BDD a été mise à jour avec le statut 'enriched' et les nouvelles infos
    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        status: "enriched",
        author: "Cal Newport",
      }),
    );
  });

  // 9.3 : Test des événements WebSocket
  it("should emit websocket events during the process", async () => {
    // AJOUT de l'ISBN ici pour que le mock searchByISBN fonctionne
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Deep Work",
      isbn: "1234567890",
    };

    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      title: "Deep Work",
    } as any);
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({
      title: "Deep Work",
    } as any);

    await runEnrichmentPipeline(mockBookId);

    // 1. Vérifie le démarrage du pipeline via emitEnrichmentProgress
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
      mockBookId,
      "pipeline-started",
      expect.objectContaining({ contentType: "book" }),
    );

    // 2. Vérifie la complétion via emitEnrichmentCompleted (AC#6: enrichment.completed event)
    expect(wsEvent.emitEnrichmentCompleted).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({ source: "openlibrary" }),
    );
  });

  // 9.4 : Test de l'intégration du téléchargement de couverture
  it("should integrate cover download in the pipeline flow", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      isbn: "123",
      cover_path: null,
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue({
      cover_i: 789,
    } as any);
    vi.mocked(openLibraryClient.getCoverUrl).mockReturnValue(
      "http://covers.com/789.jpg",
    );
    vi.mocked(openLibraryClient.mapToBookMetadata).mockReturnValue({} as any);

    // On simule un téléchargement réussi
    vi.mocked(coverDownloader.downloadCover).mockResolvedValue(
      "covers/123.jpg",
    );

    await runEnrichmentPipeline(mockBookId);

    // Vérifie que le chemin de l'image est bien passé à la mise à jour finale
    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        cover_path: "covers/123.jpg",
      }),
    );
  });

  // Test du cas d'échec (Quarantaine)
  it("should move book to quarantine if no metadata is found", async () => {
    const mockBook = {
      id: mockBookId,
      content_type: "book",
      title: "Unknown Book",
    };
    vi.mocked(bookService.getBookById).mockResolvedValue(mockBook as any);

    // L'API ne trouve rien
    vi.mocked(openLibraryClient.searchByISBN).mockResolvedValue(null);
    vi.mocked(openLibraryClient.searchByTitle).mockResolvedValue([]);

    const result = await runEnrichmentPipeline(mockBookId);

    expect(result.status).toBe("quarantine");
    expect(bookService.updateBook).toHaveBeenCalledWith(
      mockBookId,
      expect.objectContaining({
        status: "quarantine",
        failure_reason: expect.stringContaining("No metadata found"),
      }),
    );
  });
});
