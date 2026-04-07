import { describe, it, expect } from "vitest";
import { extractVolumeFromTitle } from "./titleParser";

describe("extractVolumeFromTitle", () => {
  describe("French patterns", () => {
    it('extracts volume from "One Piece T01"', () => {
      const result = extractVolumeFromTitle("One Piece T01");
      expect(result).toEqual({ cleanTitle: "One Piece", volume: 1 });
    });

    it('extracts volume from "One Piece T1"', () => {
      const result = extractVolumeFromTitle("One Piece T1");
      expect(result).toEqual({ cleanTitle: "One Piece", volume: 1 });
    });

    it('extracts volume from "Naruto Tome 52"', () => {
      const result = extractVolumeFromTitle("Naruto Tome 52");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 52 });
    });

    it('extracts volume from "20th Century Boys T22"', () => {
      const result = extractVolumeFromTitle("20th Century Boys T22");
      expect(result).toEqual({ cleanTitle: "20th Century Boys", volume: 22 });
    });
  });

  describe("English/International patterns", () => {
    it('extracts volume from "Naruto Vol. 52"', () => {
      const result = extractVolumeFromTitle("Naruto Vol. 52");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 52 });
    });

    it('extracts volume from "Naruto Volume 10"', () => {
      const result = extractVolumeFromTitle("Naruto Volume 10");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 10 });
    });
  });

  describe("Hash and parenthesis patterns", () => {
    it('extracts volume from "Bleach #3"', () => {
      const result = extractVolumeFromTitle("Bleach #3");
      expect(result).toEqual({ cleanTitle: "Bleach", volume: 3 });
    });

    it('extracts volume from "Dragon Ball (42)"', () => {
      const result = extractVolumeFromTitle("Dragon Ball (42)");
      expect(result).toEqual({ cleanTitle: "Dragon Ball", volume: 42 });
    });
  });

  describe("No volume cases", () => {
    it("returns null volume for title without volume", () => {
      const result = extractVolumeFromTitle("Harry Potter");
      expect(result).toEqual({ cleanTitle: "Harry Potter", volume: null });
    });

    it("returns null volume for empty title", () => {
      const result = extractVolumeFromTitle("");
      expect(result).toEqual({ cleanTitle: "", volume: null });
    });

    it("handles title with number in middle (not volume)", () => {
      const result = extractVolumeFromTitle("20th Century Boys");
      expect(result).toEqual({ cleanTitle: "20th Century Boys", volume: null });
    });
  });
});
