import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  startFileWatcher,
  stopFileWatcher,
  getFileWatcherStatus,
} from "./fileWatcher";

describe("fileWatcher", () => {
  let tempDir: string;

  beforeEach(() => {
    // 7.8: Create test fixtures in temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fileWatcher-test-"));
    process.env.WATCH_DIR = tempDir;
    process.env.SUPPORTED_EXTENSIONS = ".epub,.cbz,.cbr";
  });

  afterEach(async () => {
    await stopFileWatcher();
    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  describe("startFileWatcher", () => {
    // 7.3: Test successful start
    it("starts successfully with valid directory", () => {
      const callback = vi.fn();
      const watcher = startFileWatcher(callback);

      expect(watcher).not.toBeNull();
      expect(getFileWatcherStatus().running).toBe(true);
      expect(getFileWatcherStatus().watchDir).toBe(tempDir);
    });

    // 7.4: Test watcher handles missing directory gracefully
    it("returns null when directory does not exist (ENOENT)", () => {
      process.env.WATCH_DIR = "/path/to/nowhere/that/exists";
      const callback = vi.fn();
      const watcher = startFileWatcher(callback);

      expect(watcher).toBeNull();
      expect(getFileWatcherStatus().running).toBe(false);
    });

    // 7.2: Test configuration parsing (missing env)
    it("returns null when WATCH_DIR is not set", () => {
      delete process.env.WATCH_DIR;
      const callback = vi.fn();
      const watcher = startFileWatcher(callback);

      expect(watcher).toBeNull();
    });

    // 7.5: Test file detection callback
    it("detects new epub file", async () => {
      const callback = vi.fn();
      startFileWatcher(callback);

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 200));

      const testFile = path.join(tempDir, "test-book.epub");
      fs.writeFileSync(testFile, "test content");

      // Wait for detection (depends on awaitWriteFinish)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "test-book.epub",
          extension: ".epub",
        }),
      );
    });

    // 7.6: Test temporary files are ignored (.tmp, .part, .crdownload)
    it("ignores .tmp, .part and .crdownload files", async () => {
      const callback = vi.fn();
      startFileWatcher(callback);

      await new Promise((resolve) => setTimeout(resolve, 200));

      fs.writeFileSync(path.join(tempDir, "temp.tmp"), "content");
      fs.writeFileSync(path.join(tempDir, "download.part"), "content");
      fs.writeFileSync(path.join(tempDir, "chrome-download.crdownload"), "content");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(callback).not.toHaveBeenCalled();
    });

    it("ignores hidden files (dotfiles)", async () => {
      const callback = vi.fn();
      startFileWatcher(callback);

      await new Promise((resolve) => setTimeout(resolve, 200));

      fs.writeFileSync(path.join(tempDir, ".DS_Store"), "content");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(callback).not.toHaveBeenCalled();
    });

    it("detects files in subdirectories (recursive)", async () => {
      const callback = vi.fn();
      startFileWatcher(callback);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const subDir = path.join(tempDir, "comics");
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, "spiderman.cbz"), "content");

      await new Promise((resolve) => setTimeout(resolve, 2500));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "spiderman.cbz",
        }),
      );
    });
  });

  describe("stopFileWatcher", () => {
    // 7.7: Test graceful shutdown
    it("stops watcher and clears status", async () => {
      const callback = vi.fn();
      startFileWatcher(callback);

      expect(getFileWatcherStatus().running).toBe(true);

      await stopFileWatcher();

      expect(getFileWatcherStatus().running).toBe(false);
      expect(getFileWatcherStatus().watchDir).toBeNull();
    });
  });
});
