export interface EnrichmentResult {
  success: boolean;
  source: string;
  bookId: number;
  fieldsUpdated: string[];
  coverUpdated: boolean;
  error?: string;
}

/**
 * Clean title for search (shared logic with AniList).
 * If a shared titleCleaner utility exists, import from there instead.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\bv(?:ol(?:ume)?)?\.?\s*\d+/gi, "")
    .replace(/\b(?:tome|t)\s*\d+/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));

  const intersection = [...aChars].filter((c) => bChars.has(c)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return (intersection / union) * 100;
}

export function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
