import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";
import { getFileWatcherConfig, FileWatcherConfig } from "../config/fileWatcher";

export interface FileDetectedEvent {
  filePath: string;
  filename: string;
  extension: string;
  timestamp: Date;
}

export type OnFileDetectedCallback = (
  event: FileDetectedEvent,
) => void | Promise<void>;

let watcher: FSWatcher | null = null;
let onFileDetected: OnFileDetectedCallback | null = null;
let activeConfig: FileWatcherConfig | null = null;

/**
 * Check if file has a supported extension.
 */
function isSupportedFile(
  filePath: string,
  supportedExtensions: string[],
): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensions.includes(ext);
}

/**
 * Start the file watcher service.
 * @param callback - Function to call when a supported file is detected
 * @returns The FSWatcher instance or null if startup failed
 */
export function startFileWatcher(
  callback: OnFileDetectedCallback,
): FSWatcher | null {
  if (watcher !== null) {
    logger.warn("File watcher is already running.", { context: "fileWatcher" });
    return watcher;
  }

  // Get config (returns null without crashing if not configured)
  try {
    activeConfig = getFileWatcherConfig();
  } catch (err) {
    logger.error(
      "WATCH_DIR not set or configuration invalid. Watcher disabled.",
      {
        context: "fileWatcher",
        error: err as Error,
      },
    );
    return null;
  }

  // Verify directory exists and is readable (ENOENT / EACCES handling)
  try {
    // R_OK checks directory is readable
    fs.accessSync(activeConfig.watchDir, fs.constants.R_OK);
  } catch (err: any) {
    const errorType =
      err.code === "ENOENT"
        ? "Directory doesn't exist (ENOENT)"
        : "Permission denied (EACCES)";
    logger.error(`${errorType}: ${activeConfig.watchDir}`, {
      context: "fileWatcher",
      code: err.code,
    });
    return null;
  }

  onFileDetected = callback;

  try {
    watcher = chokidar.watch(activeConfig.watchDir, {
      ignored: [
        ...activeConfig.ignoredPatterns,
        /(^|[\/\\])\../, // Ignore hidden files (dotfiles)
      ],
      persistent: true,
      ignoreInitial: true,
      depth: undefined,
      followSymlinks: true,
      awaitWriteFinish: activeConfig.awaitWriteFinish,
      usePolling: activeConfig.usePolling,
    });

    // Handle file add events with logging
    watcher.on("add", async (filePath: string) => {
      if (!isSupportedFile(filePath, activeConfig!.supportedExtensions)) {
        return;
      }

      const event: FileDetectedEvent = {
        filePath,
        filename: path.basename(filePath),
        extension: path.extname(filePath).toLowerCase(),
        timestamp: new Date(),
      };

      logger.info(`File detected: ${event.filename}`, {
        context: "fileWatcher",
        path: event.filePath,
      });

      if (onFileDetected) {
        try {
          await onFileDetected(event);
        } catch (err) {
          // Log callback error without stopping the watcher
          logger.error("Callback execution failed", {
            context: "fileWatcher",
            filePath,
            error: err as Error,
          });
        }
      }
    });

    // Handle runtime errors (e.g., network disconnect on remote mount)
    watcher.on("error", (err: unknown) => {
      logger.error("Watcher runtime error", {
        context: "fileWatcher",
        error: err instanceof Error ? err : new Error(String(err)),
      });
    });

    // Log watcher ready status
    watcher.on("ready", () => {
      logger.info(
        `File watcher status: READY. Monitoring: ${activeConfig?.watchDir}`,
        {
          context: "fileWatcher",
        },
      );
    });

    return watcher;
  } catch (err) {
    // Ultimate crash protection during initialization
    logger.error("Failed to initialize file watcher", {
      context: "fileWatcher",
      error: err as Error,
    });
    return null;
  }
}

/**
 * Stop the file watcher service gracefully.
 */
export async function stopFileWatcher(): Promise<void> {
  if (watcher !== null) {
    await watcher.close();
    watcher = null;
    onFileDetected = null;
    activeConfig = null;
    logger.info("File watcher stopped gracefully.", { context: "fileWatcher" });
  }
}

/**
 * Get the current file watcher status.
 */
export function getFileWatcherStatus(): {
  running: boolean;
  watchDir: string | null;
} {
  return {
    running: watcher !== null,
    watchDir: activeConfig ? activeConfig.watchDir : null,
  };
}
