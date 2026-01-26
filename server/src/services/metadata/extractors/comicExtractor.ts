import AdmZip from "adm-zip";
import { createExtractorFromFile } from "node-unrar-js";
import { XMLParser } from "fast-xml-parser";
import path from "path";
import fs from "fs/promises";
import { logger } from "../../../utils/logger";

const context = "comicExtractor";

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export interface ComicExtractedMetadata {
  title: string | null;
  author: string | null;
  description: string | null;
  series: string | null;
  volume: number | null;
  genres: string[] | null;
  publication_date: string | null;
}

export interface CoverExtractionResult {
  coverPath: string | null;
  error?: string;
}

/**
 * Extract metadata from ComicInfo.xml in CBZ/CBR file.
 */
export async function extractComicMetadata(
  filePath: string,
  fileType: "cbz" | "cbr",
): Promise<ComicExtractedMetadata> {
  logger.info("Extracting comic metadata", { context, filePath, fileType });

  const comicInfoContent = await getComicInfoContent(filePath, fileType);

  if (!comicInfoContent) {
    logger.info("No ComicInfo.xml found", { context, filePath });
    return {
      title: null,
      author: null,
      description: null,
      series: null,
      volume: null,
      genres: null,
      publication_date: null,
    };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(comicInfoContent);
  const info = parsed.ComicInfo || {};

  const result: ComicExtractedMetadata = {
    title: extractText(info.Title),
    author: extractText(info.Writer),
    description: extractText(info.Summary),
    series: extractText(info.Series),
    volume: extractVolume(info.Volume || info.Number),
    genres: extractGenres(info.Genre),
    publication_date: extractPublicationDate(info.Year, info.Month, info.Day),
  };

  logger.info("Comic metadata extracted", { context, result });

  return result;
}

/**
 * Get ComicInfo.xml content from archive.
 */
async function getComicInfoContent(
  filePath: string,
  fileType: "cbz" | "cbr",
): Promise<string | null> {
  if (fileType === "cbz") {
    return getCbzComicInfo(filePath);
  } else {
    return getCbrComicInfo(filePath);
  }
}

/**
 * Get ComicInfo.xml from CBZ (ZIP) archive.
 */
function getCbzComicInfo(filePath: string): string | null {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    // Find ComicInfo.xml (case-insensitive)
    const comicInfoEntry = entries.find(
      (entry) =>
        entry.entryName.toLowerCase() === "comicinfo.xml" ||
        entry.entryName.toLowerCase().endsWith("/comicinfo.xml"),
    );

    if (!comicInfoEntry) {
      return null;
    }
    return zip.readAsText(comicInfoEntry);
  } catch (err) {
    logger.error("Failed to read ComicInfo.xml from CBZ", {
      context,
      filePath,
      error: err,
    });
    return null;
  }
}

/**
 * Get ComicInfo.xml from CBR (RAR) archive.
 */
async function getCbrComicInfo(filePath: string): Promise<string | null> {
  try {
    const extractor = await createExtractorFromFile({ filepath: filePath });
    const list = extractor.getFileList();
    const fileHeaders = [...list.fileHeaders];

    // Find ComicInfo.xml (case-insensitive)
    const comicInfoHeader = fileHeaders.find(
      (header) =>
        header.name.toLowerCase() === "comicinfo.xml" ||
        header.name.toLowerCase().endsWith("/comicinfo.xml"),
    );

    if (!comicInfoHeader) {
      return null;
    }

    // Extract the file
    const extracted = extractor.extract({ files: [comicInfoHeader.name] });
    const files = [...extracted.files];

    if (files.length === 0 || !files[0].extraction) {
      return null;
    }

    // Convert Uint8Array to string
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(files[0].extraction);
  } catch (err) {
    logger.error("Failed to read ComicInfo.xml from CBR", {
      context,
      filePath,
      error: err,
    });
    return null;
  }
}

/**
 * Extract text value, returning null if empty.
 */
function extractText(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Extract volume number from string.
 */
function extractVolume(value: unknown): number | null {
  if (!value) return null;
  const num = parseInt(String(value), 10);
  return isNaN(num) ? null : num;
}

/**
 * Extract genres from comma-separated string or array.
 */
function extractGenres(value: unknown): string[] | null {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  // Split by comma and clean up
  const genres = text
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);

  return genres.length > 0 ? genres : null;
}

/**
 * Extract publication date from Year/Month/Day fields.
 */
function extractPublicationDate(
  year: unknown,
  month?: unknown,
  day?: unknown,
): string | null {
  if (!year) return null;

  const y = String(year);
  const m = month ? String(month).padStart(2, "0") : "01";
  const d = day ? String(day).padStart(2, "0") : "01";

  return `${y}-${m}-${d}`;
}

/**
 * Check if filename is a supported image.
 */
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Extract cover image from CBZ/CBR and save to covers directory
 */
export async function extractComicCover(
  filePath: string,
  fileType: "cbz" | "cbr",
  bookId: number,
): Promise<CoverExtractionResult> {
  logger.info("Extracting comic cover", {
    context,
    filePath,
    fileType,
    bookId,
  });

  try {
    let coverBuffer: Buffer | null = null;
    let coverExt: string = ".jpg";

    if (fileType === "cbz") {
      const result = extractCbzCover(filePath);
      coverBuffer = result.buffer;
      coverExt = result.ext;
    } else {
      const result = await extractCbrCover(filePath);
      coverBuffer = result.buffer;
      coverExt = result.ext;
    }

    if (!coverBuffer) {
      logger.info("No cover image found in archive", { context, filePath });
      return { coverPath: null };
    }

    // Save cover to data/covers/
    const coversDir = path.join(process.cwd(), "data", "covers");
    await fs.mkdir(coversDir, { recursive: true });

    const coverFilename = `${bookId}${coverExt}`;
    const coverSavePath = path.join(coversDir, coverFilename);
    await fs.writeFile(coverSavePath, coverBuffer);

    const relativePath = `covers/${coverFilename}`;
    logger.info("Cover extracted and saved", {
      context,
      coverPath: relativePath,
    });

    return { coverPath: relativePath };
  } catch (err) {
    logger.error("Failed to extract cover", { context, filePath, error: err });
    return { coverPath: null, error: String(err) };
  }
}

/**
 * Extract first image from CBZ archive.
 */
function extractCbzCover(filePath: string): {
  buffer: Buffer | null;
  ext: string;
} {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  // Get sorted image files
  const imageFiles = entries
    .filter((entry) => !entry.isDirectory && isImageFile(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  if (imageFiles.length === 0) {
    return { buffer: null, ext: ".jpg" };
  }

  const firstImage = imageFiles[0];
  const ext = path.extname(firstImage.entryName).toLowerCase() || ".jpg";

  return {
    buffer: firstImage.getData(),
    ext,
  };
}

/**
 * Extract first image from CBR archive.
 */
async function extractCbrCover(
  filePath: string,
): Promise<{ buffer: Buffer | null; ext: string }> {
  const extractor = await createExtractorFromFile({ filepath: filePath });
  const list = extractor.getFileList();
  const fileHeaders = [...list.fileHeaders];

  // Get sorted image files
  const imageFiles = fileHeaders
    .filter((header) => !header.flags.directory && isImageFile(header.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (imageFiles.length === 0) {
    return { buffer: null, ext: ".jpg" };
  }

  const firstImage = imageFiles[0];
  const ext = path.extname(firstImage.name).toLowerCase() || ".jpg";

  // Extract the image
  const extracted = extractor.extract({ files: [firstImage.name] });
  const files = [...extracted.files];

  if (files.length === 0 || !files[0].extraction) {
    return { buffer: null, ext };
  }

  return {
    buffer: Buffer.from(files[0].extraction),
    ext,
  };
}
