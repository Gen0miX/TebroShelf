import AdmZip from "adm-zip";
import path from "path";

export function createTestCbz(
  tempDir: string,
  filename: string,
  comicInfoXml?: string,
): string {
  const zip = new AdmZip();

  if (comicInfoXml) {
    zip.addFile("ComicInfo.xml", Buffer.from(comicInfoXml));
  }

  const filePath = path.join(tempDir, filename);
  zip.writeZip(filePath);

  return filePath;
}

export function createTestCbzWithImages(
  tempDir: string,
  filename: string,
  files: { name: string; content?: string }[],
): string {
  const zip = new AdmZip();

  for (const file of files) {
    zip.addFile(file.name, Buffer.from(file.content ?? "fake-image-data"));
  }

  const filePath = path.join(tempDir, filename);
  zip.writeZip(filePath);
  return filePath;
}
