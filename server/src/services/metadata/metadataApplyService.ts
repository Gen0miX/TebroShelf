import { updateBook } from "../library/bookService";
import { downloadCover } from "./coverDownloader";
import { logger } from "../../utils/logger";

export interface ApplyMetadataOptions {
  title: string;
  author?: string | null;
  description?: string | null;
  genres?: string[];
  publicationDate?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  language?: string | null;
  series?: string | null;
  volume?: number | null;
  coverUrl?: string | null;
}

export interface ApplyMetadataResult {
  bookId: number;
  fieldsUpdated: string[];
  coverDownloaded: boolean;
}

/**
 * Apply metadata to a book, updating the database and downloading covers if necessary.
 */
export async function applyMetadata(
  bookId: number,
  metadata: ApplyMetadataOptions
): Promise<ApplyMetadataResult> {
  const { coverUrl, publicationDate, ...metadataFields } = metadata;
  const fieldsUpdated: string[] = [];
  const updateData: Record<string, unknown> = {};

  // Map fields to DB schema (snake_case)
  if (metadataFields.title) {
    updateData.title = metadataFields.title;
    fieldsUpdated.push("title");
  }
  if (metadataFields.author !== undefined) {
    updateData.author = metadataFields.author;
    fieldsUpdated.push("author");
  }
  if (metadataFields.description !== undefined) {
    updateData.description = metadataFields.description;
    fieldsUpdated.push("description");
  }
  if (metadataFields.genres !== undefined) {
    updateData.genres = metadataFields.genres;
    fieldsUpdated.push("genres");
  }
  if (publicationDate !== undefined) {
    updateData.publication_date = publicationDate;
    fieldsUpdated.push("publication_date");
  }
  if (metadataFields.publisher !== undefined) {
    updateData.publisher = metadataFields.publisher;
    fieldsUpdated.push("publisher");
  }
  if (metadataFields.isbn !== undefined) {
    updateData.isbn = metadataFields.isbn;
    fieldsUpdated.push("isbn");
  }
  if (metadataFields.language !== undefined) {
    updateData.language = metadataFields.language;
    fieldsUpdated.push("language");
  }
  if (metadataFields.series !== undefined) {
    updateData.series = metadataFields.series;
    fieldsUpdated.push("series");
  }
  if (metadataFields.volume !== undefined) {
    updateData.volume = metadataFields.volume;
    fieldsUpdated.push("volume");
  }

  // Download cover if URL provided
  let coverDownloaded = false;
  if (coverUrl) {
    try {
      const localPath = await downloadCover(coverUrl, bookId);
      if (localPath) {
        updateData.cover_path = localPath;
        fieldsUpdated.push("cover_path");
        coverDownloaded = true;
      } else {
        logger.warn("Cover not found, cover not updated", {
          context: "metadata",
          bookId,
          coverUrl,
        });
      }
    } catch (err) {
      logger.error("Error during cover download in applyMetadata", {
        context: "metadata",
        bookId,
        error: err,
      });
      // We continue even if cover download fails
    }
  }

  if (Object.keys(updateData).length > 0) {
    await updateBook(bookId, updateData);
  }

  return {
    bookId,
    fieldsUpdated,
    coverDownloaded,
  };
}
