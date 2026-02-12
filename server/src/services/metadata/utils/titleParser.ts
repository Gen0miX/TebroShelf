export interface VolumeExtractionResult {
  cleanTitle: string;
  volume: number | null;
}

/**
 * Volume extraction patterns ordered by priority.
 * Patterns match at the end of titles after trimming whitespace.
 */
const VOLUME_PATTERNS: RegExp[] = [
  // French patterns: T01, T1, T 01, Tome 1, Tome01
  /\bT(?:ome)?\s*(\d+)\s*$/i,
  // English/International: Vol. 1, Vol 1, Volume 1
  /\bVol(?:ume)?\.?\s*(\d+)\s*$/i,
  // Hash pattern: #1, #01
  /\s#(\d+)\s*$/,
  // Parenthesis pattern: (1), (01)
  /\s\((\d+)\)\s*$/,
];

/**
 * Extracts volume number from a book/manga title.
 *
 * Supports common French and English volume indicators:
 * - T01, T1, T 01, Tome 1, Tome01 (French)
 * - Vol. 1, Vol 1, Volume 1 (English/International)
 * - #1 (Hash)
 * - (1) (Parenthesis)
 *
 * @param title - The full title including potential volume indicator
 * @returns Object with cleanTitle (volume indicator removed) and volume (number or null)
 *
 * @example
 * extractVolumeFromTitle("One Piece T01") // { cleanTitle: "One Piece", volume: 1 }
 * extractVolumeFromTitle("Harry Potter") // { cleanTitle: "Harry Potter", volume: null }
 */
export function extractVolumeFromTitle(title: string): VolumeExtractionResult {
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return { cleanTitle: "", volume: null };
  }

  for (const pattern of VOLUME_PATTERNS) {
    const match = trimmedTitle.match(pattern);
    if (match && match[1]) {
      const volume = parseInt(match[1], 10);
      const cleanTitle = trimmedTitle.replace(pattern, "").trim();
      return { cleanTitle, volume };
    }
  }

  return { cleanTitle: trimmedTitle, volume: null };
}
