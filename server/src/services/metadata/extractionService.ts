import { getBookById, updateBook } from "../library/bookService";
import {
  extractEpubMetadata,
  extractEpubCover,
} from "./extractors/epubExtractor";
import {
  extractComicMetadata,
  extractComicCover,
} from "./extractors/comicExtractor";
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

/**
 * Process metadata extraction for a CBZ/CBR file.
 */
export async function processComicExtraction(
  bookId: number,
): Promise<ExtractionResult> {
  logger.info("Starting comic extraction", { context, bookId });

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

    if (book.file_type !== "cbz" && book.file_type !== "cbr") {
      result.error = "Not a CBZ/CBR file";
      return result;
    }

    emitEnrichmentStarted(bookId, { fileType: book.file_type });

    // 2. Extract metadata from ComicInfo.xml

    try {
      const metadata = await extractComicMetadata(
        book.file_path,
        book.file_type,
      );

      // Update book with extracted metadata (only non-null fields)
      const updateData: Record<string, unknown> = {};

      if (metadata.title) updateData.title = metadata.title;
      if (metadata.author) updateData.author = metadata.author;
      if (metadata.description) updateData.description = metadata.description;
      if (metadata.series) updateData.series = metadata.series;
      if (metadata.volume !== undefined) updateData.volume = metadata.volume;
      if (metadata.genres) updateData.genres = JSON.stringify(metadata.genres);
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
      // Continue to cover extraction even if metadata fails
    }

    // 3. Extract cover image
    try {
      const coverResult = await extractComicCover(
        book.file_path,
        book.file_type,
        bookId,
      );

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

    // AC #7: emit enrichment.progress with step "extraction-complete"
    emitEnrichmentProgress(bookId, "extraction-complete", {
      metadataExtracted: result.metadataExtracted,
      coverExtracted: result.coverExtracted,
    });

    emitEnrichmentCompleted(bookId, {
      metadataExtracted: result.metadataExtracted,
      coverExtracted: result.coverExtracted,
    });

    logger.info("Comic extraction completed", { context, result });
    return result;
  } catch (err) {
    result.error = String(err);
    logger.error("Comic extraction failed", { context, bookId, error: err });
    return result;
  }
}
