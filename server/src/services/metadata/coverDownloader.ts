import path from "path";
import fs from "fs/promises";
import { logger } from "../../utils/logger";

const context = "coverDownloader";
const COVERS_DIR = path.join(process.cwd(), "data", "covers");
const LOW_QUALITY_THRESHOLD = 50_000; // 50 KB — covers below this are considered low quality

/**
 * Download cover image from URL and save locally.
 */
export async function downloadCover(
  url: string,
  bookId: number,
): Promise<string | null> {
  logger.info("Downloading Cover", { context, url, bookId });

  try {
    // Ensure covers directory exists
    await fs.mkdir(COVERS_DIR, { recursive: true });

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        logger.info("Cover not found", { context, url });
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? ".png" : ".jpg";

    const buffer = await response.arrayBuffer();

    // Check if we got a valid image (not a blank/placeholder)
    if (buffer.byteLength < 1000) {
      logger.info("Cover image too small, likely placeholder", {
        context,
        size: buffer.byteLength,
      });
      return null;
    }

    const coverFilename = `${bookId}${ext}`;
    const coverPath = path.join(COVERS_DIR, coverFilename);

    await fs.writeFile(coverPath, Buffer.from(buffer));

    const relativePath = `covers/${coverFilename}`;
    logger.info("Cover downloaded successfully", { context, relativePath });

    return relativePath;
  } catch (err) {
    logger.error("Failed to download cover", { context, url, error: err });
    return null;
  }
}

/**
 * Check if existing cover file is low quality (small file size).
 * Returns true if cover is missing or below LOW_QUALITY_THRESHOLD bytes.
 */
export async function isCoverLowQuality(
  coverPath: string,
): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), "data", coverPath);
    const stats = await fs.stat(fullPath);
    return stats.size < LOW_QUALITY_THRESHOLD;
  } catch {
    // File doesn't exist or can't be read → treat as low quality
    return true;
  }
}
