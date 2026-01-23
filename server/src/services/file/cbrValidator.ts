import path from "path";
import fs from "fs";
import { logger } from "../../utils/logger.js";

// node-unrar-js for RAR extraction
import { createExtractorFromFile } from "node-unrar-js";

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export interface CbrValidationResult {
  valid: boolean;
  reason?: string;
  imageCount?: number;
  firstImagePath?: string; // For cover extraction in Story 3.2
  hasComicInfo?: boolean; // ComicInfo.xml presence for metadata extraction
}

/**
 * Check if filename has a supported image extension.
 */
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Validates a CBR (Comic Book RAR) file structure.
 * CBR must be a valid RAR containing at least one image file.
 */
export async function validateCbr(
  filePath: string,
): Promise<CbrValidationResult> {
  const context = "cbrValidator";

  try {
    // 1. Check file exists and is readable
    if (!fs.existsSync(filePath)) {
      logger.warn("CBR file not found", { context, filePath });
      return { valid: false, reason: "File not found" };
    }

    // 2. Try to open as RAR archive
    let extractor;
    try {
      extractor = await createExtractorFromFile({ filepath: filePath });
    } catch (err) {
      logger.warn("Invalid RAR structure", {
        context,
        filePath,
        error: (err as Error).message,
      });
      return {
        valid: false,
        reason: "Invalid RAR structure - file is corrupted or not a valid CBR",
      };
    }

    // 3. List archive contents
    const list = extractor.getFileList();
    const fileHeaders = [...list.fileHeaders];

    if (fileHeaders.length === 0) {
      logger.warn("Empty RAR archive", { context, filePath });
      return { valid: false, reason: "Empty archive - CBR contains no files" };
    }

    // 4. Find image files
    const imageFiles = fileHeaders
      .filter((header) => !header.flags.directory && isImageFile(header.name))
      .map((header) => header.name)
      .sort();

    if (imageFiles.length === 0) {
      logger.warn("No image files found in CBR", { context, filePath });
      return {
        valid: false,
        reason:
          "No image files found in archive - CBR must contain at least one image (.jpg, .jpeg, .png, .gif, .webp)",
      };
    }

    // 5. Check for ComicInfo.xml (optional)
    const hasComicInfo = fileHeaders.some(
      (header) =>
        header.name.toLowerCase() === "comicinfo.xml" ||
        header.name.toLowerCase().endsWith("/comicinfo.xml"),
    );

    logger.info("CBR validation passed", {
      context,
      filePath,
      imageCount: imageFiles.length,
      hasComicInfo,
    });

    return {
      valid: true,
      imageCount: imageFiles.length,
      firstImagePath: imageFiles[0],
      hasComicInfo,
    };
  } catch (err) {
    logger.error("CBR validation error", {
      context,
      filePath,
      error: err as Error,
    });
    return {
      valid: false,
      reason: `Validation error: ${(err as Error).message}`,
    };
  }
}
