import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { validateCbz } from "./cbzValidator";
import {
  createValidTestCbz,
  createCbzWithComicInfo,
  createCbzWithoutImages,
  createInvalidCbz,
} from "./testUtils";

// Mock logger to avoid polluting console output during tests
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("cbzValidator", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temporary folder for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cbz-validator-test-"));
  });

  afterEach(() => {
    // Cleanup temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // 6.3 Success test for a valid CBZ
  it("should return success for a valid CBZ with image files", async () => {
    const filePath = createValidTestCbz(tempDir, "valid-manga.cbz");

    const result = await validateCbz(filePath);

    expect(result.valid).toBe(true);
    expect(result.imageCount).toBeGreaterThan(0);
    expect(result.firstImagePath).toBeDefined();
    expect(result.firstImagePath).toMatch(/\.(jpg|jpeg|png|gif|webp)$/i);
    expect(result.reason).toBeUndefined();
  });

  // 6.4 & 6.6 Test invalid ZIP structure (corrupted)
  it("should return failure for a corrupted or non-ZIP file", async () => {
    const filePath = createInvalidCbz(tempDir, "corrupted.cbz");

    const result = await validateCbz(filePath);

    expect(result.valid).toBe(false);
    // Verify specific error message (AC 6.6)
    expect(result.reason).toContain("Invalid ZIP structure");
  });

  // 6.5 & 6.6 Test ZIP archive without images
  it("should return failure for a ZIP archive containing no supported images", async () => {
    const filePath = createCbzWithoutImages(tempDir, "empty.cbz");

    const result = await validateCbz(filePath);

    expect(result.valid).toBe(false);
    // Verify specific error message (AC 6.6)
    expect(result.reason).toContain("No image files found in archive");
  });

  // 6.7 Test detection of ComicInfo.xml (Present)
  it("should detect optional ComicInfo.xml metadata file", async () => {
    const filePath = createCbzWithComicInfo(tempDir, "with-metadata.cbz");

    const result = await validateCbz(filePath);

    expect(result.valid).toBe(true);
    expect(result.hasComicInfo).toBe(true);
  });

  // 6.7 Test detection of ComicInfo.xml (Absent)
  it("should report hasComicInfo as false when metadata file is missing", async () => {
    const filePath = createValidTestCbz(tempDir, "no-metadata.cbz");

    const result = await validateCbz(filePath);

    expect(result.valid).toBe(true);
    expect(result.hasComicInfo).toBe(false);
  });

  it("should return failure if the file path does not exist", async () => {
    const result = await validateCbz("/path/to/non/existent/file.cbz");

    expect(result.valid).toBe(false);
    expect(result.reason).toContain(
      "Invalid ZIP structure - file is corrupted or not a valid CBZ",
    );
  });
});
