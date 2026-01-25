import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import path from "path";
import fs from "fs/promises";
import { logger } from "../../../utils/logger";

const context = "epubExtractor";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export interface EpubExtractedMetadata {
  title: string | null;
  author: string | null;
  description: string | null;
  publisher: string | null;
  language: string | null;
  isbn: string | null;
  genres: string[] | null;
  publication_date: string | null;
}

export interface CoverExtractionResult {
  coverPath: string | null;
  error?: string;
}

/**
 * Extract metadata from EPUB content.opf file.
 */
export async function extractEpubMetadata(
  filePath: string,
): Promise<EpubExtractedMetadata> {
  logger.info("Extracting EPUB metadata", { context, filePath });

  const zip = new AdmZip(filePath);

  // 1. Find content.opf path from container.xml
  const containerXml = zip.readAsText("META-INF/container.xml");
  const opfPathMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);

  if (!opfPathMatch) {
    throw new Error("Could not find content.opf path in container.xml");
  }

  const opfPath = opfPathMatch[1];

  // 2. Read and parse content.opf
  const opfContent = zip.readAsText(opfPath);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      ["dc:creator", "dc:subject", "dc:identifier"].includes(name),
  });

  const opf = parser.parse(opfContent);
  const metadata = opf.package?.metadata || {};

  // 3. Extract Dublin Core elements
  const result: EpubExtractedMetadata = {
    title: extractText(metadata["dc:title"]),
    author: extractAuthors(metadata["dc:creator"]),
    description: extractText(metadata["dc:description"]),
    publisher: extractText(metadata["dc:publisher"]),
    language: extractText(metadata["dc:language"]),
    isbn: extractIsbn(metadata["dc:identifier"]),
    genres: extractSubjects(metadata["dc:subject"]),
    publication_date: extractText(metadata["dc:date"]),
  };

  logger.info("EPUB metadata extracted", { context, result });

  return result;
}

/**
 * Extract text from a DC element (handles string or object with #text).
 */
function extractText(element: unknown): string | null {
  if (!element) return null;
  if (typeof element === "string") return element.trim() || null;
  if (typeof element === "number") return String(element);
  if (typeof element === "object" && element !== null) {
    const obj = element as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"]).trim() || null;
  }
  return null;
}

function extractAuthors(creators: unknown[]): string | null {
  if (!creators || !Array.isArray(creators)) return null;

  const authors = creators
    .filter((c) => {
      if (typeof c === "string") return true;
      if (typeof c === "object" && c !== null) {
        const obj = c as Record<string, unknown>;
        // Include if no role specified, or role is "aut" (author)
        const role = obj["@_opf:role"] || obj["@_role"];
        return !role || role === "aut";
      }
      return false;
    })
    .map((c) => extractText(c))
    .filter((name): name is string => name !== null);

  return authors.length > 0 ? authors.join(", ") : null;
}

/**
 * Extract ISBN from dc:identifier elements.
 */
function extractIsbn(identifiers: unknown[]): string | null {
  if (!identifiers || !Array.isArray(identifiers)) return null;

  for (const id of identifiers) {
    const text = extractText(id);
    if (!text) continue;

    // Check opf:scheme attribute for ISBN
    if (typeof id === "object" && id !== null) {
      const obj = id as Record<string, unknown>;
      const scheme = obj["@_opf:scheme"] || obj["@_scheme"];
      if (scheme && String(scheme).toLowerCase() === "isbn") {
        const digits = text.replace(/[-\s]/g, "");
        if (/^\d{10}$|^\d{13}$/.test(digits)) {
          return digits;
        }
      }
    }

    // Match explicit ISBN prefix (urn:isbn:, isbn:, ISBN )
    const prefixMatch = text.match(
      /(?:urn:isbn:|isbn[:\s]+)([\d-]{10,17})/i,
    );
    if (prefixMatch) {
      return prefixMatch[1].replace(/-/g, "");
    }

    // Fallback: standalone 13-digit starting with 978/979
    const standaloneMatch = text.match(/\b(97[89]\d{10})\b/);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }
  }
  return null;
}

/**
 * Extract genres from dc:subject elements.
 */
function extractSubjects(subjects: unknown[]): string[] | null {
  if (!subjects || !Array.isArray(subjects)) return null;

  const genres = subjects
    .map((s) => extractText(s))
    .filter((g): g is string => g !== null && g.length > 0);

  return genres.length > 0 ? genres : null;
}

/**
 * Extract cover image from EPUB and save to covers directory
 */
export async function extractEpubCover(
  filePath: string,
  bookId: number,
): Promise<CoverExtractionResult> {
  logger.info("Extracting EPUB cover", { context, filePath, bookId });

  try {
    const zip = new AdmZip(filePath);

    // 1. Find content.opf path
    const containerXml = zip.readAsText("META-INF/container.xml");
    const opfPathMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);

    if (!opfPathMatch) {
      return { coverPath: null, error: "Could not find content.opf" };
    }

    const opfPath = opfPathMatch[1];
    const opfDir = path.dirname(opfPath);
    const opfContent = zip.readAsText(opfPath);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name) => name === "item",
    });

    const opf = parser.parse(opfContent);
    const metadata = opf.package?.metadata || {};
    const manifest = opf.package?.manifest?.item || [];

    // 2. Find cover image ID from meta element
    let coverId: string | null = null;

    // Method 1: <meta name="cover" content="cover-id"/>
    const metaElements = Array.isArray(metadata.meta)
      ? metadata.meta
      : metadata.meta
        ? [metadata.meta]
        : [];

    for (const meta of metaElements) {
      if (meta["@_name"] === "cover") {
        coverId = meta["@_content"];
        break;
      }
    }

    // Method 2: <item properties="cover-image"/>
    if (!coverId) {
      for (const item of manifest) {
        if (item["@_properties"]?.includes("cover-image")) {
          coverId = item["@_id"];
          break;
        }
      }
    }

    if (!coverId) {
      logger.info("No cover found in EPUB", { context, filePath });
      return { coverPath: null };
    }

    // 3. Find cover item in manifest
    const coverItem = manifest.find(
      (item: Record<string, unknown>) => item["@_id"] === coverId,
    );

    if (!coverItem) {
      return { coverPath: null, error: "Cover item not found in manifest" };
    }

    const coverHref = coverItem["@_href"] as string;
    const coverFullPath = path.join(opfDir, coverHref).replace(/\\/g, "/");

    // 4. Extract cover image
    const coverEntry = zip.getEntry(coverFullPath);
    if (!coverEntry) {
      // Try without directory prefix
      const altEntry = zip.getEntry(coverHref);
      if (!altEntry) {
        return { coverPath: null, error: "Cover file not found in archive" };
      }
    }

    const coverBuffer = (coverEntry || zip.getEntry(coverHref))!.getData();
    const ext = path.extname(coverHref).toLowerCase() || ".jpg";

    // 5. Save cover to data/covers/
    const coversDir = path.join(DATA_DIR, "covers");
    await fs.mkdir(coversDir, { recursive: true });

    const coverFilename = `${bookId}${ext}`;
    const coverSavePath = path.join(coversDir, coverFilename);
    await fs.writeFile(coverSavePath, coverBuffer);

    const relativePath = `covers/${coverFilename}`;
    logger.info("Cover extracted and saved", {
      context,
      coverPath: relativePath,
    });

    return { coverPath: relativePath };
  } catch (err) {
    logger.error("Failed to extract cover", { context, error: err });
    return { coverPath: null, error: String(err) };
  }
}
