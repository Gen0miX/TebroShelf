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
} from "./sources/mangadexClient";
import { OpenLibraryBook } from "./sources/openLibraryClient";
import { GoogleBooksVolume } from "./sources/googleBooksClient";
import { getScrapingConfig } from "../../config/scraping";
import { logger } from "../../utils/logger";

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
  volume?: string | null;
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
): Promise<MetadataSearchResult[]> {
  try {
    switch (source) {
      case "openlibrary":
        return mapOpenLibraryResults(await olSearch(query));
      case "googlebooks":
        return mapGoogleBooksResults(await gbSearch(query));
      case "anilist":
        return mapAniListResults(await alSearch(query));
      case "myanimelist":
        return mapMyAnimeListResults(await malSearch(query));
      case "mangadex":
        return mapMangaDexResults(await mdSearch(query));
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
  }));
}

function mapGoogleBooksResults(
  volumes: GoogleBooksVolume[],
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
    };
  });
}

function mapAniListResults(mediaList: AniListMedia[]): MetadataSearchResult[] {
  return mediaList.map((media) => ({
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
  }));
}

function mapMyAnimeListResults(nodes: MalMangaNode[]): MetadataSearchResult[] {
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
  }));
}

function mapMangaDexResults(
  mangaList: MangaDexManga[],
): MetadataSearchResult[] {
  return mangaList.map((manga) => {
    const coverFile = mdGetCoverFile(manga.relationships);
    return {
      sourceId: manga.id,
      externalId: manga.id,
      title: mdGetLocale(manga.attributes.title) || "Unknown Title",
      author: mdGetAuthor(manga.relationships),
      description: mdGetLocale(manga.attributes.description),
      coverUrl: coverFile ? mdBuildCover(manga.id, coverFile) : null,
      genres: mdExtractGenres(manga.attributes.tags),
      publicationDate: manga.attributes.year
        ? String(manga.attributes.year)
        : null,
      source: "mangadex",
    };
  });
}
