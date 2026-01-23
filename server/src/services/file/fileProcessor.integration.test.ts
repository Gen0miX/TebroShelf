import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { db } from "../../db";
import { books } from "../../db/schema";
import { eq } from "drizzle-orm";
import { startFileWatcher, stopFileWatcher } from "../../workers/fileWatcher";
import { processDetectedFile } from "./fileProcessor";
import {
  createValidTestEpub,
  createValidTestCbz,
  createDummyCbr,
} from "./testUtils";
import * as eventEmitter from "../../websocket/event";
import { createExtractorFromFile } from "node-unrar-js";

// Mock the RAR extractor for integration tests (CBR)
vi.mock("node-unrar-js", () => ({
  createExtractorFromFile: vi.fn(),
}));

describe("File Processor Integration", () => {
  let tempWatchDir: string;

  beforeEach(async () => {
    // 1. Setup temporary watch directory
    tempWatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-integration-"));
    process.env.WATCH_DIR = tempWatchDir;

    // 2. Clean database
    await db.delete(books);

    // 3. Spy on WebSocket events
    vi.spyOn(eventEmitter, "emitFileDetected");
  });

  afterEach(async () => {
    await stopFileWatcher();
    if (fs.existsSync(tempWatchDir)) {
      fs.rmSync(tempWatchDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  /**
   * TEST: EPUB Flow (Original Test)
   */
  it("should detect, process, and save a book in the database when an EPUB is added", async () => {
    const processingComplete = new Promise<void>((resolve) => {
      startFileWatcher(async (event) => {
        await processDetectedFile(event);
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const fileName = "integration-test.epub";
    createValidTestEpub(tempWatchDir, fileName);

    await processingComplete;

    const dbBooks = await db
      .select()
      .from(books)
      .where(eq(books.title, "Integration Test"));

    expect(dbBooks).toHaveLength(1);
    expect(dbBooks[0]).toMatchObject({
      file_type: "epub",
      content_type: "book",
    });

    expect(eventEmitter.emitFileDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: fileName,
        contentType: "book",
      }),
    );
  });

  /**
   * TEST: CBZ Flow (Task 9.2, 9.5, 9.6)
   */
  it("should detect and save a manga record for a CBZ file", async () => {
    const processingComplete = new Promise<void>((resolve) => {
      startFileWatcher(async (event) => {
        await processDetectedFile(event);
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const fileName = "manga-test.cbz";
    createValidTestCbz(tempWatchDir, fileName);

    await processingComplete;

    const dbBooks = await db
      .select()
      .from(books)
      .where(eq(books.file_type, "cbz"));

    expect(dbBooks).toHaveLength(1);
    expect(dbBooks[0]).toMatchObject({
      title: "Manga Test",
      content_type: "manga",
    });

    expect(eventEmitter.emitFileDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "manga",
        bookId: dbBooks[0].id,
      }),
    );
  });

  /**
   * TEST: CBR Flow (Task 9.3)
   */
  it("should process a CBR file correctly using mocked unrar extractor", async () => {
    // Setup mock for node-unrar-js
    (createExtractorFromFile as Mock).mockResolvedValue({
      getFileList: () => ({
        fileHeaders: [{ name: "page1.jpg", flags: { directory: false } }],
      }),
    });

    const processingComplete = new Promise<void>((resolve) => {
      startFileWatcher(async (event) => {
        await processDetectedFile(event);
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const fileName = "comic-test.cbr";
    createDummyCbr(tempWatchDir, fileName);

    await processingComplete;

    const dbBooks = await db
      .select()
      .from(books)
      .where(eq(books.file_type, "cbr"));

    expect(dbBooks).toHaveLength(1);
    expect(dbBooks[0].content_type).toBe("manga");
  });

  /**
   * TEST: Duplicates (Original Test)
   */
  it("should not create a duplicate if the same file is detected twice", async () => {
    const fileName = "duplicate-check.epub";
    const filePath = createValidTestEpub(tempWatchDir, fileName);

    // First manual pass
    await processDetectedFile({
      filePath,
      filename: fileName,
      extension: ".epub",
      timestamp: new Date(),
    });

    // Second manual pass
    const result = await processDetectedFile({
      filePath,
      filename: fileName,
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.action).toBe("skipped");

    const allBooks = await db.select().from(books);
    expect(allBooks).toHaveLength(1);
  });
});
