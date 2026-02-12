// Step label mapping for enrichment progress display (Story 3.14)

const STEP_LABELS: Record<string, string> = {
  started: "Starting enrichment...",
  "metadata-extracted": "Metadata extracted",
  "cover-extracted": "Cover image extracted",
  "extraction-complete": "File extraction complete",
  "pipeline-started": "Starting API enrichment...",
  "manga-pipeline-started": "Starting manga enrichment...",
  "openlibrary-search-started": "Searching OpenLibrary...",
  "openlibrary-match-found": "Found match on OpenLibrary",
  "openlibrary-no-match": "No match on OpenLibrary",
  "googlebooks-search-started": "Searching Google Books...",
  "googlebooks-match-found": "Found match on Google Books",
  "googlebooks-no-match": "No match on Google Books",
  "anilist-search-started": "Searching AniList...",
  "anilist-match-found": "Found match on AniList",
  "anilist-no-match": "No match on AniList",
  "mal-search-started": "Searching MyAnimeList...",
  "mal-match-found": "Found match on MyAnimeList",
  "mal-no-match": "No match on MyAnimeList",
  "mangadex-search-started": "Searching MangaDex...",
  "mangadex-match-found": "Found match on MangaDex",
  "mangadex-no-match": "No match on MangaDex",
  "enrichment-completed": "Enrichment complete",
  completed: "Enrichment complete!",
  "enrichment-failed": "Enrichment failed",
};

/**
 * Get human-readable label for an enrichment step.
 * Returns the step string itself if no mapping exists.
 */
export function getStepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

/**
 * Check if the step is a terminal state (completed or failed).
 */
export function isTerminalStep(step: string): boolean {
  return (
    step === "completed" ||
    step === "enrichment-completed" ||
    step === "enrichment-failed"
  );
}
