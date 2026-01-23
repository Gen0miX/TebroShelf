import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import fs from "fs";
import { validateCbr } from "./cbrValidator";
import { createExtractorFromFile } from "node-unrar-js";

// Mocking dependencies
vi.mock("node-unrar-js", () => ({
  createExtractorFromFile: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("cbrValidator", () => {
  const mockFilePath = "/test/manga.cbr";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: file exists on disk
    (fs.existsSync as Mock).mockReturnValue(true);
  });

  // 7.3 Test success for valid CBR with images
  it("should return success for a valid CBR containing images", async () => {
    // Mock extractor with image files
    const mockExtractor = {
      getFileList: () => ({
        fileHeaders: [
          { name: "page-001.jpg", flags: { directory: false } },
          { name: "page-002.png", flags: { directory: false } },
          { name: "notes.txt", flags: { directory: false } },
        ],
      }),
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockExtractor);

    const result = await validateCbr(mockFilePath);

    expect(result.valid).toBe(true);
    expect(result.imageCount).toBe(2);
    expect(result.firstImagePath).toBe("page-001.jpg");
    expect(result.hasComicInfo).toBe(false);
  });

  // 7.4 Test failure for corrupted/invalid RAR
  it("should return failure for corrupted or invalid RAR structure", async () => {
    // Mock extractor throwing an error (simulating corrupted header/format)
    (createExtractorFromFile as Mock).mockRejectedValue(
      new Error("Invalid RAR format"),
    );

    const result = await validateCbr(mockFilePath);

    expect(result.valid).toBe(false);
    // 7.6 Check specific error message
    expect(result.reason).toContain("Invalid RAR structure");
  });

  // 7.5 Test failure for RAR without any images
  it("should return failure for a CBR that contains no images", async () => {
    const mockExtractor = {
      getFileList: () => ({
        fileHeaders: [
          { name: "description.txt", flags: { directory: false } },
          { name: "metadata.json", flags: { directory: false } },
        ],
      }),
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockExtractor);

    const result = await validateCbr(mockFilePath);

    expect(result.valid).toBe(false);
    // 7.6 Check specific error message
    expect(result.reason).toContain("No image files found");
  });

  it("should return failure for an empty archive", async () => {
    const mockExtractor = {
      getFileList: () => ({
        fileHeaders: [],
      }),
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockExtractor);

    const result = await validateCbr(mockFilePath);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Empty archive");
  });

  // Test optional ComicInfo.xml detection
  it("should detect optional ComicInfo.xml file", async () => {
    const mockExtractor = {
      getFileList: () => ({
        fileHeaders: [
          { name: "page1.webp", flags: { directory: false } },
          { name: "ComicInfo.xml", flags: { directory: false } },
        ],
      }),
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockExtractor);

    const result = await validateCbr(mockFilePath);

    expect(result.valid).toBe(true);
    expect(result.hasComicInfo).toBe(true);
  });

  it("should return failure if the file does not exist on disk", async () => {
    (fs.existsSync as Mock).mockReturnValue(false);

    const result = await validateCbr("/missing.cbr");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("File not found");
  });

  // 7.6 Test specific error messages for EACH failure type
  it("should cover all specific error return paths", async () => {
    // 1. Test: File not found
    (fs.existsSync as Mock).mockReturnValue(false);
    const res1 = await validateCbr(mockFilePath);
    expect(res1.reason).toBe("File not found");

    // 2. Test: Invalid RAR structure (corrupted)
    (fs.existsSync as Mock).mockReturnValue(true);
    (createExtractorFromFile as Mock).mockRejectedValue(
      new Error("Unrar error"),
    );
    const res2 = await validateCbr(mockFilePath);
    expect(res2.reason).toBe(
      "Invalid RAR structure - file is corrupted or not a valid CBR",
    );

    // 3. Test: Empty archive (0 files)
    const mockEmpty = { getFileList: () => ({ fileHeaders: [] }) };
    (createExtractorFromFile as Mock).mockResolvedValue(mockEmpty);
    const res3 = await validateCbr(mockFilePath);
    expect(res3.reason).toBe("Empty archive - CBR contains no files");

    // 4. Test: No images found (but contains other files)
    const mockNoImages = {
      getFileList: () => ({
        fileHeaders: [{ name: "readme.txt", flags: { directory: false } }],
      }),
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockNoImages);
    const res4 = await validateCbr(mockFilePath);
    expect(res4.reason).toBe(
      "No image files found in archive - CBR must contain at least one image (.jpg, .jpeg, .png, .gif, .webp)",
    );

    // 5. Test: Unexpected runtime error (The final catch block)
    // We simulate this by making getFileList itself crash
    const mockCrashingExtractor = {
      getFileList: () => {
        throw new Error("Unexpected crash");
      },
    };
    (createExtractorFromFile as Mock).mockResolvedValue(mockCrashingExtractor);
    const res5 = await validateCbr(mockFilePath);
    expect(res5.reason).toBe("Validation error: Unexpected crash");
  });
});
