import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";

// Mock all dependencies before importing the module
vi.mock("fs/promises");
vi.mock("../library/bookService");
vi.mock("./fileProcessor");
vi.mock("../../websocket/event");
vi.mock("../../utils/logger");

import {
  triggerForceScan,
  isScanRunning,
  ScanResult,
} from "./scanService";
import * as bookService from "../library/bookService";
import * as fileProcessor from "./fileProcessor";
import * as eventEmitter from "../../websocket/event";

describe("scanService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the scan lock by triggering a scan that completes
    vi.resetModules();
    // Set up WATCH_DIR environment variable
    process.env = { ...originalEnv, WATCH_DIR: "/test/watch/dir" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isScanRunning", () => {
    it("should return false when no scan is in progress", async () => {
      // Fresh module import to reset state
      const { isScanRunning: freshIsScanRunning } = await import(
        "./scanService"
      );
      expect(freshIsScanRunning()).toBe(false);
    });
  });

  describe("triggerForceScan", () => {
    // Task 7.2: Test triggerForceScan scans directory and finds new files
    it("should scan directory recursively and find supported files", async () => {
      // Mock directory structure with path normalization for Windows compatibility
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
        const normalizedPath = String(dirPath).replace(/\\/g, "/");
        if (normalizedPath === "/test/watch/dir") {
          return [
            { name: "book1.epub", isDirectory: () => false, isFile: () => true },
            { name: "subdir", isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (normalizedPath.endsWith("/subdir") || normalizedPath.endsWith("\\subdir")) {
          return [
            { name: "manga1.cbz", isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
      vi.mocked(fileProcessor.processDetectedFile).mockResolvedValue({
        success: true,
        action: "created",
        bookId: 1,
      });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(fs.readdir).toHaveBeenCalled();
      expect(result.filesFound).toBe(2);
      expect(result.filesProcessed).toBe(2);
    });

    // Task 7.3: Test scan respects file extension filter (.epub, .cbz, .cbr)
    it("should only include files with supported extensions", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "book.epub", isDirectory: () => false, isFile: () => true },
        { name: "manga.cbz", isDirectory: () => false, isFile: () => true },
        { name: "comic.cbr", isDirectory: () => false, isFile: () => true },
        { name: "document.pdf", isDirectory: () => false, isFile: () => true },
        { name: "image.jpg", isDirectory: () => false, isFile: () => true },
        { name: "readme.txt", isDirectory: () => false, isFile: () => true },
      ] as any);

      vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
      vi.mocked(fileProcessor.processDetectedFile).mockResolvedValue({
        success: true,
        action: "created",
        bookId: 1,
      });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      // Should only find .epub, .cbz, .cbr files (3 files)
      expect(result.filesFound).toBe(3);
      expect(fileProcessor.processDetectedFile).toHaveBeenCalledTimes(3);
    });

    // Task 7.4: Test scan skips files already in database
    it("should skip files that already exist in database", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "existing.epub", isDirectory: () => false, isFile: () => true },
        { name: "new.epub", isDirectory: () => false, isFile: () => true },
      ] as any);

      // First file exists in DB, second doesn't
      vi.mocked(bookService.getBookByFilePath)
        .mockResolvedValueOnce({ id: 1, title: "Existing Book" } as any)
        .mockResolvedValueOnce(null);

      vi.mocked(fileProcessor.processDetectedFile).mockResolvedValue({
        success: true,
        action: "created",
        bookId: 2,
      });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(2);
      expect(result.filesSkipped).toBe(1);
      expect(result.filesProcessed).toBe(1);
      expect(fileProcessor.processDetectedFile).toHaveBeenCalledTimes(1);
    });

    // Task 7.5: Test scan lock prevents concurrent scans
    it("should throw error when scan already in progress", async () => {
      // Create a long-running scan
      vi.mocked(fs.readdir).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      const { triggerForceScan: freshTriggerForceScan, isScanRunning: freshIsScanRunning } =
        await import("./scanService");

      // Start first scan (don't await)
      const firstScan = freshTriggerForceScan();

      // Wait a tick for the scan to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify scan is running
      expect(freshIsScanRunning()).toBe(true);

      // Second scan should throw
      await expect(freshTriggerForceScan()).rejects.toThrow(
        "Scan already in progress"
      );

      // Clean up - wait for first scan to complete
      await firstScan;
    });

    // Task 7.6: Test scan metrics are tracked correctly
    it("should track scan metrics correctly", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "book1.epub", isDirectory: () => false, isFile: () => true },
        { name: "book2.epub", isDirectory: () => false, isFile: () => true },
        { name: "book3.epub", isDirectory: () => false, isFile: () => true },
      ] as any);

      // book1: exists in DB (skipped)
      // book2: new, processes successfully
      // book3: new, processing fails
      vi.mocked(bookService.getBookByFilePath)
        .mockResolvedValueOnce({ id: 1 } as any) // book1 exists
        .mockResolvedValueOnce(null) // book2 is new
        .mockResolvedValueOnce(null); // book3 is new

      vi.mocked(fileProcessor.processDetectedFile)
        .mockResolvedValueOnce({ success: true, action: "created", bookId: 2 })
        .mockResolvedValueOnce({ success: false, reason: "Validation failed" });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(3);
      expect(result.filesSkipped).toBe(1);
      expect(result.filesProcessed).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    // Task 7.7: Test WebSocket event is emitted on completion
    it("should emit scan.completed WebSocket event on completion", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "book.epub", isDirectory: () => false, isFile: () => true },
      ] as any);

      vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
      vi.mocked(fileProcessor.processDetectedFile).mockResolvedValue({
        success: true,
        action: "created",
        bookId: 1,
      });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(eventEmitter.emitScanCompleted).toHaveBeenCalledWith(result);
      expect(eventEmitter.emitScanCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          filesFound: 1,
          filesProcessed: 1,
          filesSkipped: 0,
          errors: 0,
        })
      );
    });

    // Additional test: handles directory read errors gracefully
    it("should handle directory read errors gracefully", async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error("Permission denied"));

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(0);
      expect(result.filesProcessed).toBe(0);
    });

    // Additional test: handles file processing errors
    it("should continue processing other files when one fails", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "book1.epub", isDirectory: () => false, isFile: () => true },
        { name: "book2.epub", isDirectory: () => false, isFile: () => true },
      ] as any);

      vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
      vi.mocked(fileProcessor.processDetectedFile)
        .mockRejectedValueOnce(new Error("Processing error"))
        .mockResolvedValueOnce({ success: true, action: "created", bookId: 2 });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(2);
      expect(result.filesProcessed).toBe(1);
      expect(result.errors).toBe(1);
    });

    // Test: scan lock is released after scan completes (success)
    it("should release scan lock after successful completion", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const { triggerForceScan: freshTriggerForceScan, isScanRunning: freshIsScanRunning } =
        await import("./scanService");

      await freshTriggerForceScan();

      expect(freshIsScanRunning()).toBe(false);
    });

    // Test: scan lock is released after scan fails
    it("should release scan lock even when scan fails", async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error("IO Error"));

      const { triggerForceScan: freshTriggerForceScan, isScanRunning: freshIsScanRunning } =
        await import("./scanService");

      await freshTriggerForceScan();

      expect(freshIsScanRunning()).toBe(false);
    });

    // Test: undefined WATCH_DIR returns empty result
    it("should return empty result when WATCH_DIR is not defined", async () => {
      delete process.env.WATCH_DIR;

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(0);
      expect(result.filesProcessed).toBe(0);
    });

    // Test: case-insensitive extension matching
    it("should handle uppercase file extensions", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "book.EPUB", isDirectory: () => false, isFile: () => true },
        { name: "manga.CBZ", isDirectory: () => false, isFile: () => true },
        { name: "comic.Cbr", isDirectory: () => false, isFile: () => true },
      ] as any);

      vi.mocked(bookService.getBookByFilePath).mockResolvedValue(null);
      vi.mocked(fileProcessor.processDetectedFile).mockResolvedValue({
        success: true,
        action: "created",
        bookId: 1,
      });

      const { triggerForceScan: freshTriggerForceScan } = await import(
        "./scanService"
      );
      const result = await freshTriggerForceScan();

      expect(result.filesFound).toBe(3);
    });
  });
});
