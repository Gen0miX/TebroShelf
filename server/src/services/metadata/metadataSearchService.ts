import {
  searchByTitle as olSearch,
  getCoverUrl as olCover,
} from "./sources/openLibraryClient";
import {
  searchByTitle as gbSearch,
  getCoverUrl as gbCover,
  isConfigured as gbConfigured,
} from "./sources/googleBooksClient";
import {
  searchManga as alSearch,
  getCoverUrl as alCover,
  AniListMedia,
  extractAuthor as alExtractAuthor,
  stripHtmlTags as alStripHtml,
  getTotalVolumes as alGetTotalVolumes,
} from "./sources/anilistClient";
import {
  searchManga as malSearch,
  getCoverUrl as malCover,
  MalMangaNode,
  getAuthorName as malGetAuthor,
} from "./sources/malClient";
import {
  searchManga as mdSearch,
  buildCoverUrl as mdBuildCover,
  MangaDexManga,
  getLocalizedString as mdGetLocale,
  getAuthorName as mdGetAuthor,
  getCoverFileName as mdGetCoverFile,
  extractGenres as mdExtractGenres,
  getVolumeCover as mdGetVolumeCover,
} from "./sources/mangadexClient";
import { OpenLibraryBook } from "./sources/openLibraryClient";
import { GoogleBooksVolume } from "./sources/googleBooksClient";
import { getScrapingConfig } from "../../config/scraping";
import { logger } from "../../utils/logger";
import { extractVolumeFromTitle } from "./utils/titleParser";

export type MetadataSource =
  | "openlibrary"
  | "googlebooks"
  | "anilist"
  | "myanimelist"
  | "mangadex";

export const SOURCE_LABELS: Record<MetadataSource, string> = {
  openlibrary: "OpenLibrary",
  googlebooks: "Google Books",
  anilist: "AniList",
  myanimelist: "MyAnimeList",
  mangadex: "MangaDex",
};

export interface MetadataSearchResult {
  sourceId: string;
  externalId: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  genres: string[];
  publicationDate: string | null;
  source: MetadataSource;
  publisher?: string | null;
  isbn?: string | null;
  language?: string | null;
  series?: string | null;
  volume?: number | null;
}

export interface MetadataSearchOptions {
  language?: "fr" | "en" | "any";
  volume?: number;
}

export const BOOK_SOURCES: MetadataSource[] = ["openlibrary", "googlebooks"];
export const MANGA_SOURCES: MetadataSource[] = [
  "anilist",
  "myanimelist",
  "mangadex",
];

export function getAvailableSources(): MetadataSource[] {
  const sources: MetadataSource[] = ["openlibrary", "anilist", "mangadex"];

  if (gbConfigured()) sources.push("googlebooks");

  const malConfig = getScrapingConfig().myAnimeList;
  if (malConfig.clientId) sources.push("myanimelist");

  return sources;
}

export async function searchMetadata(
  query: string,
  source: MetadataSource,
  options: MetadataSearchOptions = {},
): Promise<MetadataSearchResult[]> {
  try {
    // Extract volume from query if present
    const { cleanTitle, volume: parsedVolume } = extractVolumeFromTitle(query);
    const searchQuery = cleanTitle || query;
    const effectiveVolume = options.volume ?? parsedVolume ?? undefined;

    logger.info("Searching metadata with parsed title", {
      originalQuery: query,
      cleanTitle: searchQuery,
      parsedVolume,
      effectiveVolume,
      source,
    });

    const searchOptions = {
      ...options,
      volume: effectiveVolume,
    };

    switch (source) {
      case "openlibrary":
        return mapOpenLibraryResults(
          await olSearch(searchQuery, searchOptions),
          effectiveVolume,
        );
      case "googlebooks":
        return mapGoogleBooksResults(
          await gbSearch(searchQuery, searchOptions),
          effectiveVolume,
        );
      case "anilist":
        return mapAniListResults(
          await alSearch(searchQuery, searchOptions),
          effectiveVolume,
        );
      case "myanimelist":
        return mapMyAnimeListResults(await malSearch(searchQuery), effectiveVolume);
      case "mangadex":
        return await mapMangaDexResultsWithVolume(
          await mdSearch(searchQuery, searchOptions),
          effectiveVolume,
        );
      default:
        logger.warn(`Source ${source} not yet implemented`);
        return [];
    }
  } catch (error) {
    logger.error(`Metadata search failed for source ${source}`, {
      error,
      query,
    });
    return [];
  }
}

function mapOpenLibraryResults(
  books: OpenLibraryBook[],
  volume?: number,
): MetadataSearchResult[] {
  return books.map((book) => ({
    sourceId: book.key,
    externalId: book.key,
    title: book.title,
    author: book.author_name?.join(", ") ?? null,
    description: null,
    coverUrl: olCover(book.cover_i, book.isbn?.[0]),
    genres: book.subject?.slice(0, 5) ?? [],
    publicationDate: book.first_publish_year
      ? `${book.first_publish_year}`
      : null,
    source: "openlibrary",
    publisher: book.publisher?.[0] ?? null,
    isbn: book.isbn?.[0] ?? null,
    language: book.language?.[0] ?? null,
    volume: volume ?? null,
  }));
}

function mapGoogleBooksResults(
  volumes: GoogleBooksVolume[],
  volume?: number,
): MetadataSearchResult[] {
  return volumes.map((vol) => {
    const info = vol.volumeInfo;
    const isbn13 = info.industryIdentifiers?.find(
      (id) => id.type === "ISBN_13",
    )?.identifier;
    const isbn10 = info.industryIdentifiers?.find(
      (id) => id.type === "ISBN_10",
    )?.identifier;

    return {
      sourceId: vol.id,
      externalId: vol.id,
      title: info.title,
      author: info.authors?.join(", ") ?? null,
      description: info.description ?? null,
      coverUrl: gbCover(info.imageLinks),
      genres: info.categories?.slice(0, 5) ?? [],
      publicationDate: info.publishedDate ?? null,
      source: "googlebooks",
      publisher: info.publisher ?? null,
      isbn: isbn13 || isbn10 || null,
      language: info.language ?? null,
      volume: volume ?? null,
    };
  });
}

function mapAniListResults(
  mediaList: AniListMedia[],
  volume?: number,
): MetadataSearchResult[] {
  return mediaList.map((media) => {
    const totalVolumes = alGetTotalVolumes(media);
    // Include searched volume in result; also note if it exceeds total
    const resultVolume = volume ?? null;

    return {
      sourceId: String(media.id),
      externalId: String(media.id),
      title:
        media.title.english ||
        media.title.romaji ||
        media.title.native ||
        "Unknown Title",
      author: alExtractAuthor(media.staff?.edges || []),
      description: media.description ? alStripHtml(media.description) : null,
      coverUrl: alCover(media.coverImage),
      genres: media.genres.slice(0, 5),
      publicationDate: media.startDate?.year ? `${media.startDate.year}` : null,
      source: "anilist",
      volume: resultVolume,
      // Note: totalVolumes available via alGetTotalVolumes(media) for UI hints
    };
  });
}

function mapMyAnimeListResults(
  nodes: MalMangaNode[],
  volume?: number,
): MetadataSearchResult[] {
  return nodes.map((node) => ({
    sourceId: String(node.id),
    externalId: String(node.id),
    title: node.title,
    author: malGetAuthor(node.authors),
    description: node.synopsis ?? null,
    coverUrl: malCover(node.main_picture),
    genres: node.genres.map((g) => g.name).slice(0, 5),
    publicationDate: node.start_date ?? null,
    source: "myanimelist",
    volume: volume ?? null,
  }));
}

/**
 * Map MangaDex results with volume-specific cover support.
 * When a volume is specified, attempts to fetch volume-specific covers.
 */
async function mapMangaDexResultsWithVolume(
  mangaList: MangaDexManga[],
  volume?: number,
): Promise<MetadataSearchResult[]> {
  const results: MetadataSearchResult[] = [];

  for (const manga of mangaList) {
    let coverUrl: string | null = null;

    // Try to get volume-specific cover if volume is specified
    if (volume) {
      coverUrl = await mdGetVolumeCover(manga.id, volume);
    }

    // Fallback to series cover if no volume-specific cover found
    if (!coverUrl) {
      const coverFile = mdGetCoverFile(manga.relationships);
      coverUrl = coverFile ? mdBuildCover(manga.id, coverFile) : null;
    }

    results.push({
      sourceId: manga.id,
      externalId: manga.id,
      title: mdGetLocale(manga.attributes.title) || "Unknown Title",
      author: mdGetAuthor(manga.relationships),
      description: mdGetLocale(manga.attributes.description),
      coverUrl,
      genres: mdExtractGenres(manga.attributes.tags),
      publicationDate: manga.attributes.year
        ? String(manga.attributes.year)
        : null,
      source: "mangadex",
      volume: volume ?? null,
    });
  }

  return results;
}
