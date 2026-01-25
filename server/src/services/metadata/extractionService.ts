import { getBookById, updateBook } from "../library/bookService";
import {
  extractEpubMetadata,
  extractEpubCover,
} from "./extractors/epubExtractor";
import {
  emitEnrichmentStarted,
  emitEnrichmentProgress,
  emitEnrichmentCompleted,
} from "../../websocket/event";
import { logger } from "../../utils/logger";

const context = "extractionService";

export interface ExtractionResult {
  success: boolean;
  bookId: number;
  metadataExtracted: boolean;
  coverExtracted: boolean;
  error?: string;
}

/**
 * Process metadata extraction for an EPUB file
 */
export async function processEpubExtraction(
  bookId: number,
): Promise<ExtractionResult> {
  logger.info("Starting EPUB extraction", { context, bookId });

  const result: ExtractionResult = {
    success: false,
    bookId,
    metadataExtracted: false,
    coverExtracted: false,
  };

  try {
    // 1. Get book record
    const book = await getBookById(bookId);
    if (!book) {
      result.error = "Book not found";
      return result;
    }

    if (book.file_type !== "epub") {
      result.error = "Not an EPUB file";
      return result;
    }

    emitEnrichmentStarted(bookId, { fileType: "epub" });

    // 2. Extract metadata
    try {
      const metadata = await extractEpubMetadata(book.file_path);

      // Update book with extracted metadata (only non-null fields)
      const updateData: Record<string, unknown> = {};

      if (metadata.title) updateData.title = metadata.title;
      if (metadata.author) updateData.author = metadata.author;
      if (metadata.description) updateData.description = metadata.description;
      if (metadata.publisher) updateData.publisher = metadata.publisher;
      if (metadata.language) updateData.language = metadata.language;
      if (metadata.genres) updateData.genres = metadata.genres;
      if (metadata.isbn) updateData.isbn = metadata.isbn;
      if (metadata.publication_date)
        updateData.publication_date = metadata.publication_date;

      if (Object.keys(updateData).length > 0) {
        await updateBook(bookId, updateData);
        result.metadataExtracted = true;
      }

      emitEnrichmentProgress(bookId, "metadata-extracted", {
        fields: Object.keys(updateData),
      });
    } catch (err) {
      logger.warn("Metadata extraction failed", {
        context,
        bookId,
        error: err,
      });
    }

    // 3. Extract cover
    try {
      const coverResult = await extractEpubCover(book.file_path, bookId);

      if (coverResult.coverPath) {
        await updateBook(bookId, { cover_path: coverResult.coverPath });
        result.coverExtracted = true;
        emitEnrichmentProgress(bookId, "cover-extracted", {
          coverPath: coverResult.coverPath,
        });
      }
    } catch (err) {
      logger.warn("Cover extraction failed", { context, bookId, error: err });
    }

    result.success = result.metadataExtracted || result.coverExtracted;

    // Update book status based on extraction result (Task 4.4)
    if (result.success) {
      await updateBook(bookId, { status: "enriched" });
    }

    emitEnrichmentCompleted(bookId, {
      metadataExtracted: result.metadataExtracted,
      coverExtracted: result.coverExtracted,
    });

    logger.info("EPUB extraction completed", { context, result });

    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("EPUB extraction failed", { context, bookId, error: err });
    return result;
  }
}
