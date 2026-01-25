import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";

import { extractEpubMetadata, extractEpubCover } from "./epubExtractor";
import { createTestEpub } from "./testUtils";

// Mock logger
vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("epubExtractor", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "epub-test-"));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // 7.2 Extract all metadata from valid EPUB
  it("should extract all metadata fields from valid EPUB", async () => {
    const filePath = createTestEpub(tempDir, "valid.epub");

    const result = await extractEpubMetadata(filePath);

    expect(result.title).toBe("Test Book");
    expect(result.author).toBe("John Doe");
    expect(result.description).toBe("A test description");
    expect(result.publisher).toBe("Test Publisher");
    expect(result.language).toBe("en");
    expect(result.isbn).toBe("9781234567890");
    expect(result.genres).toEqual(["Fantasy", "Adventure"]);
    expect(result.publication_date).toBe("2024");
  });

  // 7.3 Missing optional fields return null/undefined
  it("should handle missing optional fields", async () => {
    const minimalOpf = `
      <package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata>
          <dc:title>Only Title</dc:title>
        </metadata>
      </package>
    `;

    const filePath = createTestEpub(tempDir, "minimal.epub", {
      metadataXml: minimalOpf,
    });

    const result = await extractEpubMetadata(filePath);

    expect(result.title).toBe("Only Title");
    expect(result.author).toBeNull();
    expect(result.description).toBeNull();
    expect(result.publisher).toBeNull();
    expect(result.language).toBeNull();
    expect(result.isbn).toBeNull();
    expect(result.genres).toBeNull();
  });

  // 7.4 Multiple authors joined with comma
  it("should join multiple authors with comma", async () => {
    const opf = `
      <package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata>
          <dc:title>Multi Author</dc:title>
          <dc:creator>Author One</dc:creator>
          <dc:creator>Author Two</dc:creator>
        </metadata>
      </package>
    `;

    const filePath = createTestEpub(tempDir, "authors.epub", {
      metadataXml: opf,
    });

    const result = await extractEpubMetadata(filePath);

    expect(result.author).toBe("Author One, Author Two");
  });

  // 7.5 Multiple subjects become genres array
  it("should store multiple subjects as genres array", async () => {
    const opf = `
      <package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata>
          <dc:title>Genres</dc:title>
          <dc:subject>Horror</dc:subject>
          <dc:subject>Thriller</dc:subject>
        </metadata>
      </package>
    `;

    const filePath = createTestEpub(tempDir, "genres.epub", {
      metadataXml: opf,
    });

    const result = await extractEpubMetadata(filePath);

    expect(result.genres).toEqual(["Horror", "Thriller"]);
  });

  // 7.6 ISBN extraction from dc:identifier
  it("should extract ISBN from dc:identifier", async () => {
    const opf = `
      <package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata>
          <dc:title>ISBN Test</dc:title>
          <dc:identifier>isbn: 978-9876543210</dc:identifier>
        </metadata>
      </package>
    `;

    const filePath = createTestEpub(tempDir, "isbn.epub", {
      metadataXml: opf,
    });

    const result = await extractEpubMetadata(filePath);

    expect(result.isbn).toBe("9789876543210");
  });

  // 7.7 Malformed OPF handled gracefully
  it("should throw error on malformed OPF", async () => {
    const filePath = createTestEpub(tempDir, "broken.epub", {
      malformedOpf: true,
    });

    const result = await extractEpubMetadata(filePath);

    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.isbn).toBeNull();
  });
});

describe("extractEpubCover with Mocks", () => {
  let tempDir: string;
  const bookId = 123;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "epub-cover-mock-"));

    // On "espionne" les méthodes de fs/promises
    // .mockResolvedValue(undefined) simule une réussite sans rien faire sur le disque
    vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fsPromises, "writeFile").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Très important : on remet fs/promises à la normale
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should call writeFile with correct path and data", async () => {
    const filePath = createTestEpub(tempDir, "cover-test.epub", {
      coverMethod: "property",
    });

    const result = await extractEpubCover(filePath, bookId);

    // 1. On vérifie le retour de la fonction
    expect(result.coverPath).toBe(`covers/${bookId}.jpg`);

    // 2. On vérifie que mkdir a été appelé pour créer le dossier data/covers
    expect(fsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join("data", "covers")),
      { recursive: true },
    );

    // 3. On vérifie que writeFile a été appelé avec le bon nom de fichier
    // On utilise expect.any(Buffer) car le contenu exact importe peu ici
    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join("data", "covers", `${bookId}.jpg`)),
      expect.any(Buffer),
    );
  });

  // 8.2 Test cover extraction via meta name="cover" method
  it('should extract cover via meta name="cover" method', async () => {
    const filePath = createTestEpub(tempDir, "cover-meta.epub", {
      coverMethod: "meta",
    });

    const result = await extractEpubCover(filePath, bookId);

    expect(result.coverPath).toBe(`covers/${bookId}.jpg`);
    expect(fsPromises.writeFile).toHaveBeenCalled();
  });

  // 8.5 Test handling of EPUB without cover (returns null)
  it("should return null if no cover is found", async () => {
    const filePath = createTestEpub(tempDir, "no-cover.epub", {
      coverMethod: "none",
    });

    const result = await extractEpubCover(filePath, bookId);

    expect(result.coverPath).toBeNull();
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });

  it("should return error if disk write fails", async () => {
    const filePath = createTestEpub(tempDir, "fail-write.epub", {
      coverMethod: "meta",
    });

    // On simule une erreur d'écriture (ex: permission refusée)
    vi.spyOn(fsPromises, "writeFile").mockRejectedValue(new Error("Disk full"));

    const result = await extractEpubCover(filePath, bookId);

    expect(result.coverPath).toBeNull();
    expect(result.error).toContain("Disk full");
  });
});
