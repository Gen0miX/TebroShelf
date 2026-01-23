import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { processDetectedFile } from "./fileProcessor";
import * as bookService from "../library/bookService";
import * as epubValidator from "./epubValidator";
import * as cbzValidator from "./cbzValidator"; // 8.7 Mock cbzValidator
import * as cbrValidator from "./cbrValidator"; // 8.7 Mock cbrValidator
import * as eventEmitter from "../../websocket/event";
import { createValidTestEpub } from "./testUtils";

vi.mock("../library/bookService");
vi.mock("./epubValidator");
vi.mock("./cbzValidator"); // 8.7 Mocking
vi.mock("./cbrValidator"); // 8.7 Mocking
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("fileProcessor", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-processor-test-"));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * EPUB Tests (Existing logic preserved)
   */
  it("should create a book record for a valid EPUB with content_type 'book'", async () => {
    const filePath = createValidTestEpub(tempDir, "valid.epub");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(epubValidator.validateEpub).mockResolvedValue({ valid: true });
    vi.mocked(bookService.createBook).mockResolvedValue({ id: 42 } as any);

    const result = await processDetectedFile({
      filePath,
      filename: "valid.epub",
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.success).toBe(true);
    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type: "book",
        file_type: "epub",
      }),
    );
  });

  /**
   * CBZ Tests (Task 8.2, 8.4, 8.5)
   */
  it("should create a manga record for a valid CBZ file", async () => {
    const filePath = path.join(tempDir, "naruto_vol1.cbz");
    fs.writeFileSync(filePath, "dummy cbz content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(cbzValidator.validateCbz).mockResolvedValue({
      valid: true,
      imageCount: 10,
    });
    vi.mocked(bookService.createBook).mockResolvedValue({ id: 100 } as any);

    const result = await processDetectedFile({
      filePath,
      filename: "naruto_vol1.cbz",
      extension: ".cbz",
      timestamp: new Date(),
    });

    expect(result.success).toBe(true);
    // AC 8.4 & 8.5 Verify content_type and file_type
    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Naruto Vol1",
        content_type: "manga",
        file_type: "cbz",
      }),
    );
  });

  /**
   * CBR Tests (Task 8.3, 8.4, 8.5)
   */
  it("should create a manga record for a valid CBR file", async () => {
    const filePath = path.join(tempDir, "one_piece.cbr");
    fs.writeFileSync(filePath, "dummy cbr content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(cbrValidator.validateCbr).mockResolvedValue({
      valid: true,
      imageCount: 15,
    });
    vi.mocked(bookService.createBook).mockResolvedValue({ id: 101 } as any);

    const result = await processDetectedFile({
      filePath,
      filename: "one_piece.cbr",
      extension: ".cbr",
      timestamp: new Date(),
    });

    expect(result.success).toBe(true);
    // AC 8.4 & 8.5 Verify content_type and file_type
    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "One Piece",
        content_type: "manga",
        file_type: "cbr",
      }),
    );
  });

  /**
   * Duplicate Detection (Task 8.6)
   */
  it("should skip processing for CBZ/CBR files if they already exist in database", async () => {
    const filePath = path.join(tempDir, "existing_manga.cbz");
    fs.writeFileSync(filePath, "dummy content");

    // Simulate existing record in DB
    vi.mocked(bookService.getBookByFilePath).mockResolvedValue({
      id: 50,
      title: "Existing Manga",
    } as any);

    const result = await processDetectedFile({
      filePath,
      filename: "existing_manga.cbz",
      extension: ".cbz",
      timestamp: new Date(),
    });

    expect(result.action).toBe("skipped");
    expect(cbzValidator.validateCbz).not.toHaveBeenCalled(); // Should skip validation
    expect(bookService.createBook).not.toHaveBeenCalled(); // Should skip creation
  });

  /**
   * Title Extraction Logic Check
   */
  it("should properly format the title for manga files", async () => {
    const filePath = path.join(tempDir, "My-Manga_Title.cbz");
    fs.writeFileSync(filePath, "dummy content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(cbzValidator.validateCbz).mockResolvedValue({ valid: true });
    vi.mocked(bookService.createBook).mockResolvedValue({ id: 1 } as any);

    await processDetectedFile({
      filePath,
      filename: "My-Manga_Title.cbz",
      extension: ".cbz",
      timestamp: new Date(),
    });

    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My Manga Title",
      }),
    );
  });

  /**
   * Validation failure handling for Manga
   */
  it("should return failure if CBZ validation fails", async () => {
    const filePath = path.join(tempDir, "corrupted.cbz");
    fs.writeFileSync(filePath, "dummy content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(cbzValidator.validateCbz).mockResolvedValue({
      valid: false,
      reason: "No image files found",
    });

    const result = await processDetectedFile({
      filePath,
      filename: "corrupted.cbz",
      extension: ".cbz",
      timestamp: new Date(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("No image files found");
    expect(bookService.createBook).not.toHaveBeenCalled();
  });

  it("should return failure if CBR validation fails", async () => {
    const filePath = path.join(tempDir, "corrupted.cbr");
    fs.writeFileSync(filePath, "dummy content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(cbrValidator.validateCbr).mockResolvedValue({
      valid: false,
      reason: "Invalid RAR structure - file is corrupted or not a valid CBR",
    });

    const result = await processDetectedFile({
      filePath,
      filename: "corrupted.cbr",
      extension: ".cbr",
      timestamp: new Date(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe(
      "Invalid RAR structure - file is corrupted or not a valid CBR",
    );
    expect(bookService.createBook).not.toHaveBeenCalled();
  });
});
