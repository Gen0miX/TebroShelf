import { describe, it, expect } from "vitest";
import { getStepLabel, isTerminalStep } from "./enrichmentSteps";

describe("enrichmentSteps", () => {
  describe("getStepLabel", () => {
    it("should return human-readable label for known steps", () => {
      expect(getStepLabel("started")).toBe("Starting enrichment...");
      expect(getStepLabel("metadata-extracted")).toBe("Metadata extracted");
      expect(getStepLabel("cover-extracted")).toBe("Cover image extracted");
      expect(getStepLabel("pipeline-started")).toBe(
        "Starting API enrichment...",
      );
      expect(getStepLabel("openlibrary-search-started")).toBe(
        "Searching OpenLibrary...",
      );
      expect(getStepLabel("openlibrary-match-found")).toBe(
        "Found match on OpenLibrary",
      );
      expect(getStepLabel("googlebooks-no-match")).toBe(
        "No match on Google Books",
      );
      expect(getStepLabel("completed")).toBe("Enrichment complete!");
      expect(getStepLabel("enrichment-failed")).toBe("Enrichment failed");
    });

    it("should return manga enrichment step labels", () => {
      expect(getStepLabel("manga-pipeline-started")).toBe(
        "Starting manga enrichment...",
      );
      expect(getStepLabel("anilist-search-started")).toBe(
        "Searching AniList...",
      );
      expect(getStepLabel("mal-match-found")).toBe("Found match on MyAnimeList");
      expect(getStepLabel("mangadex-no-match")).toBe("No match on MangaDex");
    });

    it("should return the step string itself for unknown steps", () => {
      expect(getStepLabel("unknown-step")).toBe("unknown-step");
      expect(getStepLabel("custom-processing")).toBe("custom-processing");
      expect(getStepLabel("")).toBe("");
    });
  });

  describe("isTerminalStep", () => {
    it("should return true for completed step", () => {
      expect(isTerminalStep("completed")).toBe(true);
    });

    it("should return true for enrichment-completed step", () => {
      expect(isTerminalStep("enrichment-completed")).toBe(true);
    });

    it("should return true for enrichment-failed step", () => {
      expect(isTerminalStep("enrichment-failed")).toBe(true);
    });

    it("should return false for non-terminal steps", () => {
      expect(isTerminalStep("started")).toBe(false);
      expect(isTerminalStep("metadata-extracted")).toBe(false);
      expect(isTerminalStep("openlibrary-search-started")).toBe(false);
      expect(isTerminalStep("pipeline-started")).toBe(false);
      expect(isTerminalStep("unknown-step")).toBe(false);
    });
  });
});
