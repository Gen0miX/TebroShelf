import path from "path";
import { FileDetectedEvent } from "../../workers/fileWatcher";
import { validateEpub } from "./epubValidator";
import { validateCbz } from "./cbzValidator";
import { validateCbr } from "./cbrValidator";
import { createBook, getBookByFilePath } from "../library/bookService";
import {
  processEpubExtraction,
  processComicExtraction,
} from "../metadata/extractionService";
import { runEnrichmentPipeline } from "../metadata/enrichmentPipeline";
import { logger } from "../../utils/logger";
import { emitFileDetected } from "../../websocket/event";
import { ContentType, FileType } from "../../db/schema";
import { runMangaEnrichmentPipeline } from "../metadata/mangaEnrichmentPipeline";

export interface ProcessResult {
  success: boolean;
  action: "created" | "skipped" | "failed";
  reason?: string;
  bookId?: number;
}

/**
 * Extract clean title from filename.
 * Removes extension, replaces separators, cleans up common patterns.
 */
function extractTitleFromFilename(filename: string): string {
  // Remove extension
  const withoutExt = path.parse(filename).name;

  // Replace common separators with spaces
  let title = withoutExt.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();

  // Capitalize first letter of each word (basic title case)
  title = title.replace(/\b\w/g, (char) => char.toUpperCase());

  return title;
}

/**
 * Determine content type from file extension.
 */
function getContentType(extension: string): ContentType {
  switch (extension.toLowerCase()) {
    case ".epub":
      return "book";
    case ".cbz":
    case ".cbr":
      return "manga";
    default:
      return "book"; // Default fallback
  }
}

/**
 * Determine file type from extension.
 */
function getFileType(extension: string): FileType {
  switch (extension.toLowerCase()) {
    case ".epub":
      return "epub";
    case ".cbz":
      return "cbz";
    case ".cbr":
      return "cbr";
    default:
      throw new Error(`Unsupported file extension: ${extension}`);
  }
}

/**
 * Process a detected file: validate, create book record, emit WebSocket event.
 */
export async function processDetectedFile(
  event: FileDetectedEvent,
): Promise<ProcessResult> {
  const context = "fileProcessor";
  const { filePath, filename, extension } = event;

  logger.info("Processing detected file", { context, filename, extension });

  // 1. Check for duplicate
  const existingBook = await getBookByFilePath(filePath);
  if (existingBook) {
    logger.warn("Duplicate file detected, skipping", {
      context,
      filePath,
      existingBookId: existingBook.id,
    });
    return {
      success: true,
      action: "skipped",
      reason: "File already exists in database",
    };
  }

  // 2. Validate based on file type
  if (extension.toLowerCase() === ".epub") {
    const validationResult = await validateEpub(filePath);

    if (!validationResult.valid) {
      logger.warn("EPUB validation failed", {
        context,
        filePath,
        reason: validationResult.reason,
      });
      return {
        success: false,
        action: "failed",
        reason: validationResult.reason,
      };
    }
  } else if (extension.toLowerCase() === ".cbz") {
    const validationResult = await validateCbz(filePath);
    if (!validationResult.valid) {
      logger.warn("CBZ validation failed", {
        context,
        filePath,
        reason: validationResult.reason,
      });
      return {
        success: false,
        action: "failed",
        reason: validationResult.reason,
      };
    }
  } else if (extension.toLowerCase() === ".cbr") {
    const validationResult = await validateCbr(filePath);
    if (!validationResult.valid) {
      logger.warn("CBR validation failed", {
        context,
        filePath,
        reason: validationResult.reason,
      });
      return {
        success: false,
        action: "failed",
        reason: validationResult.reason,
      };
    }
  } else {
    logger.warn("Unsupported file extension", { context, filePath, extension });
    return {
      success: false,
      action: "failed",
      reason: `Unsupported file type: ${extension}`,
    };
  }

  // 3. Create book record
  try {
    const title = extractTitleFromFilename(filename);
    const contentType = getContentType(extension);
    const fileType = getFileType(extension);

    const book = await createBook({
      title,
      file_path: filePath,
      file_type: fileType,
      content_type: contentType,
      // status defaults to 'pending'
      // visibility defaults to 'public'
    });

    if (extension.toLowerCase() === ".epub" && book.id) {
      // Extract metadata first, then enrich (sequential: enrichment needs extracted metadata)
      processEpubExtraction(book.id)
        .then(() => runEnrichmentPipeline(book.id))
        .catch((err) => {
          logger.error("Background EPUB extraction or enrichment failed", {
            context,
            bookId: book.id,
            error: err,
          });
        });
    } else if (
      (extension.toLowerCase() === ".cbz" ||
        extension.toLowerCase() === ".cbr") &&
      book.id
    ) {
      // Extract metadata first, then enrich (sequential: enrichment needs extracted metadata)
      processComicExtraction(book.id)
        .then(() => runMangaEnrichmentPipeline(book.id))
        .catch((err) => {
          logger.error("Background comic extraction or enrichment failed", {
            context,
            bookId: book.id,
            error: err,
          });
        });
    }

    logger.info("Book record created", {
      context,
      bookId: book.id,
      title,
      contentType,
      fileType,
    });

    // 4. Emit WebSocket event
    emitFileDetected({
      filename,
      contentType,
      bookId: book.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, action: "created", bookId: book.id };
  } catch (err) {
    logger.error("Failed to create book record", {
      context,
      filePath,
      error: err as Error,
    });
    return {
      success: false,
      action: "failed",
      reason: `Database error: ${(err as Error).message}`,
    };
  }
}
