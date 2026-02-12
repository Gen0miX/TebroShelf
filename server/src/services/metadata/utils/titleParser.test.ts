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

    it('extracts volume from "Naruto Tome52"', () => {
      const result = extractVolumeFromTitle("Naruto Tome52");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 52 });
    });

    it('extracts volume from "Bleach T 05"', () => {
      const result = extractVolumeFromTitle("Bleach T 05");
      expect(result).toEqual({ cleanTitle: "Bleach", volume: 5 });
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

    it('extracts volume from "Naruto Vol 5"', () => {
      const result = extractVolumeFromTitle("Naruto Vol 5");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 5 });
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

    it('extracts volume from "Dragon Ball (1)"', () => {
      const result = extractVolumeFromTitle("Dragon Ball (1)");
      expect(result).toEqual({ cleanTitle: "Dragon Ball", volume: 1 });
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

    it("handles title with standalone number not matching patterns", () => {
      const result = extractVolumeFromTitle("Akira 1988");
      expect(result).toEqual({ cleanTitle: "Akira 1988", volume: null });
    });
  });

  describe("Edge cases", () => {
    it("handles leading/trailing whitespace", () => {
      const result = extractVolumeFromTitle("  One Piece T01  ");
      expect(result).toEqual({ cleanTitle: "One Piece", volume: 1 });
    });

    it("handles case insensitivity for Tome", () => {
      const result = extractVolumeFromTitle("Naruto TOME 5");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 5 });
    });

    it("handles case insensitivity for Vol", () => {
      const result = extractVolumeFromTitle("Naruto VOL. 5");
      expect(result).toEqual({ cleanTitle: "Naruto", volume: 5 });
    });

    it("extracts from title with special characters", () => {
      const result = extractVolumeFromTitle("JoJo's Bizarre Adventure T01");
      expect(result).toEqual({
        cleanTitle: "JoJo's Bizarre Adventure",
        volume: 1,
      });
    });

    it("handles double-digit volumes correctly", () => {
      const result = extractVolumeFromTitle("One Piece T100");
      expect(result).toEqual({ cleanTitle: "One Piece", volume: 100 });
    });

    it("handles three-digit volumes", () => {
      const result = extractVolumeFromTitle("Detective Conan T102");
      expect(result).toEqual({ cleanTitle: "Detective Conan", volume: 102 });
    });
  });
});
