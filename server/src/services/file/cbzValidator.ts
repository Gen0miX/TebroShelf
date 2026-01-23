import AdmZip from "adm-zip";
import path from "path";
import { logger } from "../../utils/logger.js";

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export interface CbzValidationResult {
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
 * Validates a CBZ (Comic Book ZIP) file structure.
 * CBZ must be a valid ZIP containing at least one image file.
 */
export async function validateCbz(
  filePath: string,
): Promise<CbzValidationResult> {
  const context = "cbzValidator";

  try {
    // 1. Check ZIP structure
    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (err) {
      logger.warn("Invalid ZIP structure", {
        context,
        filePath,
        error: (err as Error).message,
      });
      return {
        valid: false,
        reason: "Invalid ZIP structure - file is corrupted or not a valid CBZ",
      };
    }

    const entries = zip.getEntries();

    // 2. Find image files (excluding directories)
    const imageFiles = entries
      .filter((entry) => !entry.isDirectory && isImageFile(entry.entryName))
      .map((entry) => entry.entryName)
      .sort(); // Sort for consistent first image

    if (imageFiles.length === 0) {
      logger.warn("No image files found in CBZ", { context, filePath });
      return {
        valid: false,
        reason:
          "No image files found in archive - CBZ must contain at least one image (.jpg, .jpeg, .png, .gif, .webp)",
      };
    }

    // 3. Check for ComicInfo.xml (optional, for metadata extraction)
    const hasComicInfo = entries.some(
      (entry) =>
        entry.entryName.toLowerCase() === "comicinfo.xml" ||
        entry.entryName.toLowerCase().endsWith("/comicinfo.xml"),
    );

    logger.info("CBZ validation passed", {
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
    logger.error("CBZ validation error", {
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
