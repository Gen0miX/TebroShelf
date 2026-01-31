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
  sourceId: number;
  externalId: number;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  genres: string | null;
  publicationDate: string | null;
  source: MetadataSource;
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
