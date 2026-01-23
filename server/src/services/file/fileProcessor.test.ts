import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { processDetectedFile } from "./fileProcessor";
import * as bookService from "../library/bookService";
import * as epubValidator from "./epubValidator";
import * as eventEmitter from "../../websocket/event";
import { createValidTestEpub } from "./testUtils";

vi.mock("../library/bookService");
vi.mock("./epubValidator");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

describe("fileProcessor", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-processor-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should extract a clean title from the filename", async () => {
    const filePath = createValidTestEpub(tempDir, "mon_livre-genial.epub");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(epubValidator.validateEpub).mockResolvedValue({ valid: true });
    vi.mocked(bookService.createBook).mockResolvedValue({ id: 1 } as any);

    await processDetectedFile({
      filePath,
      filename: "mon_livre-genial.epub",
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mon Livre Genial",
      }),
    );
  });

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
    expect(result.action).toBe("created");
    expect(result.bookId).toBe(42);

    expect(bookService.createBook).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type: "book",
        file_type: "epub",
      }),
    );

    expect(eventEmitter.emitFileDetected).toHaveBeenCalled();
  });

  it("should skip processing if file already exists in database", async () => {
    const filePath = path.join(tempDir, "duplicate.epub");
    fs.writeFileSync(filePath, "dummy content");

    vi.mocked(bookService.getBookByFilePath).mockResolvedValue({
      id: 10,
      title: "Existing",
    } as any);

    const result = await processDetectedFile({
      filePath,
      filename: "duplicate.epub",
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.action).toBe("skipped");
    expect(result.reason).toContain("already exists");
    expect(bookService.createBook).not.toHaveBeenCalled();
    expect(epubValidator.validateEpub).not.toHaveBeenCalled();
  });

  it("should handle failures during book creation", async () => {
    const filePath = createValidTestEpub(tempDir, "error.epub");
    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(epubValidator.validateEpub).mockResolvedValue({ valid: true });

    vi.mocked(bookService.createBook).mockRejectedValue(new Error("DB Error"));

    const result = await processDetectedFile({
      filePath,
      filename: "error.epub",
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe("failed");
    expect(result.reason).toContain("Database error");
  });

  it("should NOT create book record when EPUB validation fails (AC #4)", async () => {
    const filePath = createValidTestEpub(tempDir, "invalid.epub");
    vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
    vi.mocked(epubValidator.validateEpub).mockResolvedValue({
      valid: false,
      reason: "Missing mimetype file - not a valid EPUB",
    });

    const result = await processDetectedFile({
      filePath,
      filename: "invalid.epub",
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe("failed");
    expect(result.reason).toContain("Missing mimetype");
    expect(bookService.createBook).not.toHaveBeenCalled();
    expect(eventEmitter.emitFileDetected).not.toHaveBeenCalled();
  });
});
