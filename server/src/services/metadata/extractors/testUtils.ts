import AdmZip from "adm-zip";
import path from "path";

export interface TestEpubOptions {
  metadataXml?: string; // Pour injecter un XML personnalisé (cas spécifiques)
  malformedOpf?: boolean; // Pour tester les erreurs de parsing
  coverMethod?: "meta" | "property" | "none"; // Pour tester l'extraction d'image
}

export function createTestEpub(
  tempDir: string,
  filename: string,
  options?: TestEpubOptions,
): string {
  const zip = new AdmZip();

  // 1. Structure obligatoire : META-INF/container.xml
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(`
      <?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>
    `),
  );

  // 2. Gestion de l'image physique (si une couverture est demandée)
  if (options?.coverMethod && options.coverMethod !== "none") {
    // On ajoute un faux buffer d'image dans le zip
    zip.addFile(
      "OEBPS/images/cover.jpg",
      Buffer.from("fake-binary-data-for-image"),
    );
  }

  // 3. Construction du contenu de content.opf
  let opfContent: string;

  if (options?.malformedOpf) {
    opfContent = `<package><metadata><dc:title>Broken`; // XML invalide (non fermé)
  } else if (options?.metadataXml) {
    opfContent = options.metadataXml;
  } else {
    // Valeurs par défaut pour les tests de métadonnées (Task 7.2)
    const coverMeta =
      options?.coverMethod === "meta"
        ? '<meta name="cover" content="cover-img-id" />'
        : "";

    const coverProperty =
      options?.coverMethod === "property" ? 'properties="cover-image"' : "";

    opfContent = `
      <package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">
        <metadata>
          <dc:title>Test Book</dc:title>
          <dc:creator>John Doe</dc:creator>
          <dc:description>A test description</dc:description>
          <dc:publisher>Test Publisher</dc:publisher>
          <dc:language>en</dc:language>
          <dc:identifier>ISBN 978-1234567890</dc:identifier>
          <dc:subject>Fantasy</dc:subject>
          <dc:subject>Adventure</dc:subject>
          <dc:date>2024</dc:date>
          ${coverMeta}
        </metadata>
        <manifest>
          <item id="cover-img-id" href="images/cover.jpg" media-type="image/jpeg" ${coverProperty} />
          <item id="text1" href="chapter1.xhtml" media-type="application/xhtml+xml" />
        </manifest>
      </package>
    `;
  }

  zip.addFile("OEBPS/content.opf", Buffer.from(opfContent));

  const filePath = path.join(tempDir, filename);
  zip.writeZip(filePath);

  return filePath;
}
