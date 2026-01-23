import AdmZip from "adm-zip";
import path from "path";
import { logger } from "../../utils/logger.js";

export interface EpubValidationResult {
  valid: boolean;
  reason?: string;
  contentOpfPath?: string; // For later metadata extraction (story 3.1)
}

/**
 * Validates an EPUB file structure.
 * EPUB must be a valid ZIP with: mimetype, META-INF/container.xml and content.opf
 */
export async function validateEpub(
  filePath: string,
): Promise<EpubValidationResult> {
  const context = "epubValidator";

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
      return { valid: false, reason: "Invalid ZIP structure" };
    }

    const entries = zip.getEntries();
    const entryNames = entries.map((e) => e.entryName);

    // 2. Check for mimetype file
    if (!entryNames.includes("mimetype")) {
      logger.warn("Missing mimetype file", { context, filePath });
      return {
        valid: false,
        reason: "Missing mimetype file - not a valid EPUB",
      };
    }

    const mimetypeEntry = zip.getEntry("mimetype");
    const mimetypeContent = mimetypeEntry?.getData().toString("utf-8").trim();
    if (mimetypeContent !== "application/epub+zip") {
      logger.warn("Invalid mimetype content", {
        context,
        filePath,
        found: mimetypeContent,
      });
      return {
        valid: false,
        reason: `Invalid mimetype: expected "application/epub+zip", found "${mimetypeContent}"`,
      };
    }

    // 3. Check META-INF/container.xml
    if (!entryNames.includes("META-INF/container.xml")) {
      logger.warn("Missing container.xml", { context, filePath });
      return {
        valid: false,
        reason: "Missing META-INF/container.xml - not a valid EPUB",
      };
    }

    // 4. Parse container.xml to find content.opf path
    const containerEntry = zip.getEntry("META-INF/container.xml");
    const containerXML = containerEntry?.getData().toString("utf-8");

    // Extract rootfile path using regex (simple, avoid XML parser dependency)
    const rootfileMatch = containerXML?.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) {
      logger.warn("Cannot find rootfile in container.xml", {
        context,
        filePath,
      });
      return {
        valid: false,
        reason: "Cannot find rootfile path in container.xml",
      };
    }

    const contentOpfPath = rootfileMatch[1];

    // 5. Verify content.opf exists
    if (!entryNames.includes(contentOpfPath)) {
      logger.warn("Missing content.opf", {
        context,
        filePath,
        expectedPath: contentOpfPath,
      });
      return {
        valid: false,
        reason: `Missing content.opf at path "${contentOpfPath}"`,
      };
    }

    logger.info("EPUB validation passed", {
      context,
      filePath,
      contentOpfPath,
    });
    return { valid: true, contentOpfPath };
  } catch (err) {
    logger.error("EPUB validation error", {
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
