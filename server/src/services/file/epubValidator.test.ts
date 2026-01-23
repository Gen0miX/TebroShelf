import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { validateEpub } from "./epubValidator";
import {
  createValidTestEpub,
  createInvalidZip,
  createEpubMissingMimetype,
  createEpubMissingContainer,
  createEpubMissingContentOpf,
} from "./testUtils";

describe("epubValidator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "epub-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("validateEpub", () => {
    it("returns valid for well-formed EPUB", async () => {
      const epubPath = createValidTestEpub(tempDir);
      const result = await validateEpub(epubPath);

      expect(result.valid).toBe(true);
      expect(result.contentOpfPath).toBe("OEBPS/content.opf");
    });

    it("returns invalid for corrupted ZIP", async () => {
      const epubPath = createInvalidZip(tempDir);
      const result = await validateEpub(epubPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid ZIP structure");
    });

    it("returns invalid for missing mimetype", async () => {
      const epubPath = createEpubMissingMimetype(tempDir);
      const result = await validateEpub(epubPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Missing mimetype");
    });

    it("returns invalid for missing container.xml", async () => {
      const epubPath = createEpubMissingContainer(tempDir);
      const result = await validateEpub(epubPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Missing META-INF/container.xml");
    });

    it("returns invalid for missing content.opf", async () => {
      const epubPath = createEpubMissingContentOpf(tempDir);
      const result = await validateEpub(epubPath);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Missing content.opf");
    });
  });
});
