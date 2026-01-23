import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { db } from "../../db";
import { books } from "../../db/schema";
import { eq } from "drizzle-orm";
import { startFileWatcher, stopFileWatcher } from "../../workers/fileWatcher";
import { processDetectedFile } from "./fileProcessor";
import { createValidTestEpub } from "./testUtils";
import * as eventEmitter from "../../websocket/event";

describe("File Processor Integration", () => {
  let tempWatchDir: string;

  beforeEach(async () => {
    // 1. Create a temporary folder for the watcher
    tempWatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-integration-"));

    // Configure the environment variable for the watcher (if your config reads it via process.env)
    process.env.WATCH_DIR = tempWatchDir;

    // 2. Clean the books table before each test to avoid collisions
    await db.delete(books);

    // 3. Spy on the WebSocket emitter (Story 9.5)
    vi.spyOn(eventEmitter, "emitFileDetected");
  });

  afterEach(async () => {
    await stopFileWatcher();
    if (fs.existsSync(tempWatchDir)) {
      fs.rmSync(tempWatchDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should detect, process, and save a book in the database when a file is added", async () => {
    // 9.2 & 9.3 : Setup of the complete flow
    // We wrap the detection in a Promise to wait for processing to complete
    const processingComplete = new Promise<void>((resolve) => {
      startFileWatcher(async (event) => {
        await processDetectedFile(event);
        resolve();
      });
    });

    // Wait for the watcher to be ready (Chokidar Ready)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create a real EPUB file (9.3)
    const fileName = "integration-test.epub";
    const filePath = createValidTestEpub(tempWatchDir, fileName);

    // Wait for the processor to finish its work
    await processingComplete;

    // 9.4 : Verify that the record exists in the database
    const dbBooks = await db
      .select()
      .from(books)
      .where(eq(books.title, "Integration Test"));

    expect(dbBooks).toHaveLength(1);
    expect(dbBooks[0]).toMatchObject({
      title: "Integration Test",
      file_type: "epub",
      content_type: "book",
      status: "pending",
    });

    // 9.5 : Verify that the WebSocket event was "emitted" (logged for now)
    expect(eventEmitter.emitFileDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: fileName,
        contentType: "book",
        bookId: dbBooks[0].id,
      }),
    );
  });

  it("should not create a duplicate if the same file is detected twice", async () => {
    const fileName = "duplicate-check.epub";
    const filePath = createValidTestEpub(tempWatchDir, fileName);

    // First pass
    await processDetectedFile({
      filePath,
      filename: fileName,
      extension: ".epub",
      timestamp: new Date(),
    });

    // Second pass (simulated)
    const result = await processDetectedFile({
      filePath,
      filename: fileName,
      extension: ".epub",
      timestamp: new Date(),
    });

    expect(result.action).toBe("skipped");

    const allBooks = await db.select().from(books);
    expect(allBooks).toHaveLength(1); // Still only 1 book
  });
});
