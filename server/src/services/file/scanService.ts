import fs from "fs/promises";
import path from "path";
import { logger } from "../../utils/logger";
import { processDetectedFile } from "./fileProcessor";
import { getBookByFilePath } from "../library/bookService";
import { emitScanCompleted } from "../../websocket/event";

const WATCH_DIR = process.env.WATCH_DIR;
const SUPPORTED_EXTENSIONS = [".epub", ".cbz", ".cbr"];
const context = "scanService";

export interface ScanResult {
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: number;
  duration: number;
}

// In-memory Lock to prevent concurrent scans
let isScanInProgress = false;

export function isScanRunning(): boolean {
  return isScanInProgress;
}

/**
 * Recursively scan directory for supported files.
 */
async function scanDirectory(dirPath: string | undefined): Promise<string[]> {
  const files: string[] = [];

  if (!dirPath) {
    logger.warn("Watch dir is not defined", { context, dirPath });
    return files;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        const subFiles = await scanDirectory(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (err) {
    logger.error("Error scanning directory", {
      context: context,
      dirPath,
      error: err,
    });
  }

  return files;
}

/**
 * Trigger a full scan of the watch directory.
 * Returns scan results with metrics.
 */
export async function triggerForceScan(): Promise<ScanResult> {
  if (isScanInProgress) {
    throw new Error("Scan already in progress");
  }

  isScanInProgress = true;
  const startTime = Date.now();

  const result: ScanResult = {
    filesFound: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    errors: 0,
    duration: 0,
  };

  try {
    logger.info("Starting force scan", { context, WATCH_DIR });

    // 1. Scan directory for all supported files
    const allFiles = await scanDirectory(WATCH_DIR);
    result.filesFound = allFiles.length;

    logger.info("Files found during scan", {
      context,
      count: result.filesFound,
    });

    // 2. Filter out files already in database
    const newFiles: string[] = [];
    for (const filePath of allFiles) {
      const existing = await getBookByFilePath(filePath);
      if (!existing) {
        newFiles.push(filePath);
      } else {
        result.filesSkipped++;
      }
    }

    logger.info("New files to process", { context, count: newFiles.length });

    // 3. Process each new file
    for (const filePath of newFiles) {
      try {
        const filename = path.basename(filePath);
        const extension = path.extname(filePath);

        const processResult = await processDetectedFile({
          filePath,
          filename,
          extension,
          timestamp: new Date(),
        });

        if (processResult.success) {
          result.filesProcessed++;
        } else {
          result.errors++;
          logger.warn("File processing failed during scan", {
            context,
            filePath,
            reason: processResult.reason,
          });
        }
      } catch (err) {
        result.errors++;
        logger.error("Error processing file during scan", {
          context,
          filePath,
          error: err,
        });
      }
    }

    result.duration = Date.now() - startTime;
    logger.info("Force scan completed", { context, result });

    // 4. Emit WebSocket event
    emitScanCompleted(result);

    return result;
  } finally {
    isScanInProgress = false;
  }
}
