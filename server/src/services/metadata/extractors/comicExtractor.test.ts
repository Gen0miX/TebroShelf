import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";

import { extractComicMetadata, extractComicCover } from "./comicExtractor";
import { createTestCbz, createTestCbzWithImages } from "./testUtilsComic";
import { createExtractorFromFile } from "node-unrar-js";

// mock logger
vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("node-unrar-js");

describe("comicExtractor", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "comic-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  const fullComicInfo = `
    <ComicInfo>
      <Title>Spider-Man</Title>
      <Writer>Stan Lee</Writer>
      <Summary>Great power...</Summary>
      <Series>Marvel</Series>
      <Volume>12</Volume>
      <Genre>Action, Superhero</Genre>
      <Year>1963</Year>
      <Month>03</Month>
      <Day>01</Day>
    </ComicInfo>
  `;

  // 6.2 CBZ full extraction
  it("should extract all metadata fields from CBZ with ComicInfo.xml", async () => {
    const filePath = createTestCbz(tempDir, "comic.cbz", fullComicInfo);

    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.title).toBe("Spider-Man");
    expect(result.author).toBe("Stan Lee");
    expect(result.description).toBe("Great power...");
    expect(result.series).toBe("Marvel");
    expect(result.volume).toBe(12);
    expect(result.genres).toEqual(["Action", "Superhero"]);
    expect(result.publication_date).toBe("1963-03-01");
  });

  // 6.3 CBR full extraction
  it("should extract all metadata fields from CBR with ComicInfo.xml", async () => {
    // fake unrar extractor
    (createExtractorFromFile as any).mockResolvedValue({
      getFileList: () => ({
        fileHeaders: [{ name: "ComicInfo.xml" }],
      }),
      extract: () => ({
        files: [
          {
            extraction: Buffer.from(fullComicInfo),
          },
        ],
      }),
    });

    const result = await extractComicMetadata("fake.cbr", "cbr");

    expect(result.title).toBe("Spider-Man");
    expect(result.volume).toBe(12);
  });

  // 6.4 No ComicInfo.xml (CBZ)
  it("should return null metadata if no ComicInfo.xml found in CBZ", async () => {
    const filePath = createTestCbz(tempDir, "noinfo.cbz");

    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.description).toBeNull();
    expect(result.series).toBeNull();
    expect(result.volume).toBeNull();
    expect(result.genres).toBeNull();
    expect(result.publication_date).toBeNull();
  });

  // 6.4 No ComicInfo.xml (CBR)
  it("should return null metadata if no ComicInfo.xml found in CBR", async () => {
    (createExtractorFromFile as any).mockResolvedValue({
      getFileList: () => ({
        fileHeaders: [{ name: "page01.jpg" }],
      }),
    });

    const result = await extractComicMetadata("fake-no-info.cbr", "cbr");

    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.genres).toBeNull();
  });

  // 6.5 Missing optional fields
  it("should handle missing optional fields", async () => {
    const minimal = `
      <ComicInfo>
        <Title>Only Title</Title>
      </ComicInfo>
    `;

    const filePath = createTestCbz(tempDir, "minimal.cbz", minimal);

    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.title).toBe("Only Title");
    expect(result.author).toBeNull();
    expect(result.genres).toBeNull();
    expect(result.volume).toBeNull();
  });

  // 6.6 Genre single + multiple
  it("should extract single genre", async () => {
    const xml = `
      <ComicInfo>
        <Title>X</Title>
        <Genre>Horror</Genre>
      </ComicInfo>
    `;

    const filePath = createTestCbz(tempDir, "genre.cbz", xml);
    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.genres).toEqual(["Horror"]);
  });

  it("should extract multiple genres", async () => {
    const xml = `
      <ComicInfo>
        <Title>X</Title>
        <Genre>Horror, Thriller, Mystery</Genre>
      </ComicInfo>
    `;

    const filePath = createTestCbz(tempDir, "genre2.cbz", xml);
    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.genres).toEqual(["Horror", "Thriller", "Mystery"]);
  });

  // 6.7 Volume parsing
  it("should parse volume number from string", async () => {
    const xml = `
      <ComicInfo>
        <Title>X</Title>
        <Volume>42</Volume>
      </ComicInfo>
    `;

    const filePath = createTestCbz(tempDir, "volume.cbz", xml);
    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.volume).toBe(42);
  });

  it("should ignore non numeric volume", async () => {
    const xml = `
      <ComicInfo>
        <Title>X</Title>
        <Volume>Special Edition</Volume>
      </ComicInfo>
    `;

    const filePath = createTestCbz(tempDir, "volume2.cbz", xml);
    const result = await extractComicMetadata(filePath, "cbz");

    expect(result.volume).toBeNull();
  });
});

describe("comic cover extraction", () => {
  let tempDir: string;
  const bookId = 777;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "comic-cover-"));

    vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fsPromises, "writeFile").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // 7.2 CBZ cover extraction
  it("should extract first image alphabetically from CBZ", async () => {
    const filePath = createTestCbzWithImages(tempDir, "comic.cbz", [
      { name: "z-last.png" },
      { name: "a-first.jpg" },
      { name: "b-middle.webp" },
    ]);

    const result = await extractComicCover(filePath, "cbz", bookId);

    expect(result.coverPath).toBe(`covers/${bookId}.jpg`);

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join("data", "covers", `${bookId}.jpg`)),
      expect.any(Buffer),
    );
  });

  // 7.3 CBR cover extraction
  it("should extract first image alphabetically from CBR", async () => {
    const mockExtractor = {
      getFileList: () => ({
        fileHeaders: [
          { name: "z-last.png", flags: { directory: false } },
          { name: "a-first.jpg", flags: { directory: false } },
          { name: "b-middle.webp", flags: { directory: false } },
        ],
      }),
      extract: ({ files }: any) => ({
        files: [
          {
            extraction: Buffer.from("fake-image"),
          },
        ],
      }),
    };

    const { createExtractorFromFile } = await import("node-unrar-js");
    (createExtractorFromFile as any).mockResolvedValue(mockExtractor);

    const result = await extractComicCover("fake.cbr", "cbr", bookId);

    expect(result.coverPath).toBe(`covers/${bookId}.jpg`);
    expect(fsPromises.writeFile).toHaveBeenCalled();
  });

  // 7.4 Correct extension
  it("should keep original image extension", async () => {
    const filePath = createTestCbzWithImages(tempDir, "comic.cbz", [
      { name: "cover.png" },
    ]);

    const result = await extractComicCover(filePath, "cbz", bookId);

    expect(result.coverPath).toBe(`covers/${bookId}.png`);
  });

  // 7.5 No images
  it("should return null when no images in archive", async () => {
    const filePath = createTestCbzWithImages(tempDir, "comic.cbz", [
      { name: "ComicInfo.xml", content: "<ComicInfo/>" },
    ]);

    const result = await extractComicCover(filePath, "cbz", bookId);

    expect(result.coverPath).toBeNull();
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });
});
