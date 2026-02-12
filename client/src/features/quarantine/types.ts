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

export interface MetadataSearchOptions {
  language?: "fr" | "en" | "any";
  volume?: number;
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

// Story 3.12: Manual Metadata Edit types
export interface EditMetadataRequest {
  title?: string;
  author?: string | null;
  description?: string | null;
  genres?: string[] | null;
  series?: string | null;
  volume?: number | null;
  isbn?: string | null;
  publication_date?: string | null;
  publisher?: string | null;
  language?: string | null;
}

export interface EditMetadataResponse {
  data: {
    bookId: number;
    fieldsUpdated: string[];
  };
}

export interface CoverUploadResponse {
  data: {
    bookId: number;
    coverPath: string;
  };
}

export interface BookForEdit {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  genres: string | null; // JSON string from DB
  series: string | null;
  volume: number | null;
  isbn: string | null;
  publication_date: string | null;
  publisher: string | null;
  language: string | null;
  cover_path: string | null;
  content_type: "book" | "manga";
  status: "pending" | "enriched" | "quarantine";
}

// Story 3.13: Quarantine Approval types
export interface ApproveQuarantineResponse {
  data: {
    id: number;
    title: string;
    author: string | null;
    description: string | null;
    genres: string[] | null;
    series: string | null;
    volume: number | null;
    isbn: string | null;
    publication_date: string | null;
    file_path: string;
    file_type: "epub" | "cbz" | "cbr";
    content_type: "book" | "manga";
    cover_path: string | null;
    status: "enriched";
    failure_reason: null;
    visibility: "public" | "private";
    created_at: string;
    updated_at: string;
  };
}
