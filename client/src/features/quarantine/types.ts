export interface QuarantineItemType {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  genres: string | null;
  series: string | null;
  volume: number | null;
  isbn: string | null;
  publication_date: string | null;
  publisher: string | null;
  language: string | null;
  file_path: string;
  file_type: "epub" | "cbz" | "cbr";
  content_type: "book" | "manga";
  cover_path: string | null;
  publication_status: string | null;
  status: "pending" | "enriched" | "quarantine";
  failure_reason: string | null;
  visibility: "public" | "private";
  created_at: string;
  updated_at: string;
}

export interface QuarantineListResponse {
  data: QuarantineItemType[];
  meta: { total: number };
}

export interface QuarantineCountResponse {
  data: { count: number };
}

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

export type MetadataSource =
  | "openlibrary"
  | "googlebooks"
  | "anilist"
  | "myanimelist"
  | "mangadex";

export interface MetadataSearchResponse {
  data: MetadataSearchResult[];
}

export interface MetadataSourceResponse {
  data: MetadataSource[];
}

export interface ApplyMetadataRequest {
  title: string;
  author?: string;
  description?: string;
  genres?: string[];
  publicationDate?: string;
  publisher?: string;
  isbn?: string;
  language?: string;
  series?: string;
  volume?: number;
  coverUrl?: string;
  source: MetadataSource;
  externalId: string;
}

export interface ApplyMetadataResponse {
  bookId: number;
  fieldsUpdated: string[];
  coverDownloaded: boolean;
}
