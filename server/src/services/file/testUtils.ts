// server/src/services/file/testUtils.ts
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import os from "os";

/**
 * Create a minimal valid EPUB file for testing.
 */
export function createValidTestEpub(
  dir: string,
  filename: string = "test-book.epub",
): string {
  const zip = new AdmZip();

  // mimetype (must be first, uncompressed in real EPUB, but adm-zip handles this)
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));

  // container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addFile("META-INF/container.xml", Buffer.from(containerXml));

  // content.opf (minimal)
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
</package>`;
  zip.addFile("OEBPS/content.opf", Buffer.from(contentOpf));

  const filePath = path.join(dir, filename);
  zip.writeZip(filePath);

  return filePath;
}

/**
 * Create an invalid ZIP file (not a valid EPUB).
 */
export function createInvalidZip(
  dir: string,
  filename: string = "invalid.epub",
): string {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, "This is not a ZIP file");
  return filePath;
}

/**
 * Create EPUB missing mimetype file.
 */
export function createEpubMissingMimetype(
  dir: string,
  filename: string = "no-mimetype.epub",
): string {
  const zip = new AdmZip();
  zip.addFile("META-INF/container.xml", Buffer.from("<container/>"));
  const filePath = path.join(dir, filename);
  zip.writeZip(filePath);
  return filePath;
}

/**
 * Create EPUB missing container.xml.
 */
export function createEpubMissingContainer(
  dir: string,
  filename: string = "no-container.epub",
): string {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  const filePath = path.join(dir, filename);
  zip.writeZip(filePath);
  return filePath;
}

/**
 * Create EPUB with container.xml but missing content.opf.
 */
export function createEpubMissingContentOpf(
  dir: string,
  filename: string = "no-content-opf.epub",
): string {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addFile("META-INF/container.xml", Buffer.from(containerXml));
  // Intentionally NOT adding OEBPS/content.opf
  const filePath = path.join(dir, filename);
  zip.writeZip(filePath);
  return filePath;
}
