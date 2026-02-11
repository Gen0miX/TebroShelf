import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { books } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/roleGuard";
import {
  setBookVisibility,
  applyVisibilityFilter,
} from "../services/library/visibilityService";
import { getBookById, updateBook } from "../services/library/bookService";
import { emitBookUpdated } from "../websocket/event";
import { coverUpload } from "../middleware/upload";
import { logger } from "../utils/logger";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Helper function to transform book data (parse genres JSON)
export function transformBook(
  book: any,
  includeVisibility: boolean = false,
): Record<string, any> {
  const transformed: Record<string, any> = {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    series: book.series,
    volume: book.volume,
    isbn: book.isbn,
    publication_date: book.publication_date,
    file_path: book.file_path,
    file_type: book.file_type,
    content_type: book.content_type,
    cover_path: book.cover_path,
    status: book.status,
    failure_reason: book.failure_reason,
    created_at: book.created_at.toISOString(),
    updated_at: book.updated_at.toISOString(),
  };

  // Parse genres if present and not null
  if (book.genres) {
    try {
      transformed.genres = JSON.parse(book.genres);
    } catch {
      transformed.genres = [];
    }
  } else {
    transformed.genres = null;
  }

  // Include visibility fields only for admin
  if (includeVisibility) {
    transformed.visibility = book.visibility;
    transformed.isPrivate = book.visibility === "private";
  }

  return transformed;
}

// Validation schema for visibility update (AC #1)
const visibilitySchema = z.object({
  visibility: z.enum(["public", "private"]),
});

// Validation schema for metadata edit (Story 3.12)
const metadataEditSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  genres: z.array(z.string()).nullable().optional(),
  series: z.string().nullable().optional(),
  volume: z.number().int().positive().nullable().optional(),
  isbn: z.string().nullable().optional(),
  publication_date: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});

/**
 * PATCH /api/v1/books/:id/visibility
 * Set visibility for a book (AC #1, #5)
 * Admin only endpoint
 */
router.patch(
  "/:id/visibility",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const bookId = parseInt(String(req.params.id), 10);

    // Validate bookId
    if (isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid book ID",
        },
      });
    }

    // Validate request body
    const parsed = visibilitySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: 'Invalid visibility value. Must be "public" or "private".',
        },
      });
    }

    // Check if book exists before update
    const [existingBook] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId));

    if (!existingBook) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Book not found",
        },
      });
    }

    // Update visibility
    await setBookVisibility(bookId, parsed.data.visibility);

    // Fetch updated book using bookService
    const updatedBook = await getBookById(bookId);

    if (!updatedBook) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch updated book",
        },
      });
    }

    logger.info("Book visibility updated", {
      event: "book_visibility_updated",
      bookId,
      visibility: parsed.data.visibility,
      userId: req.user!.id,
      username: req.user!.username,
    });

    return res.json({
      data: transformBook(updatedBook, true),
    });
  },
);

/**
 * PATCH /api/v1/books/:id/metadata
 * Edit metadata for a book (Story 3.12: AC #1, #2, #5, #7)
 * Admin only endpoint
 */
router.patch(
  "/:id/metadata",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const bookId = parseInt(String(req.params.id), 10);

    // Validate bookId
    if (isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid book ID",
        },
      });
    }

    // Validate request body
    const parsed = metadataEditSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid metadata fields",
          details: parsed.error.flatten().fieldErrors,
        },
      });
    }

    // Check if body is empty (no valid fields provided)
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "No metadata fields provided",
        },
      });
    }

    // Check if book exists
    const existingBook = await getBookById(bookId);

    if (!existingBook) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Book not found",
        },
      });
    }

    try {
      // Update book metadata
      await updateBook(bookId, parsed.data);

      // Determine which fields were updated
      const fieldsUpdated = Object.keys(parsed.data);

      // Emit WebSocket event
      emitBookUpdated(bookId, { fieldsUpdated });

      logger.info("Book metadata updated", {
        event: "book_metadata_updated",
        bookId,
        fieldsUpdated,
        userId: req.user!.id,
        username: req.user!.username,
      });

      return res.json({
        data: {
          bookId,
          fieldsUpdated,
        },
      });
    } catch (error) {
      logger.error("Failed to update book metadata", {
        event: "book_metadata_update_failed",
        bookId,
        error,
      });

      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update metadata",
        },
      });
    }
  },
);

/**
 * POST /api/v1/books/:id/cover
 * Upload a cover image for a book (Story 3.12: AC #3)
 * Admin only endpoint
 */
router.post(
  "/:id/cover",
  requireAuth,
  requireAdmin,
  (req: Request, res: Response, next) => {
    coverUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "File too large. Maximum size is 5MB.",
            },
          });
        }
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
          },
        });
      } else if (err) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
          },
        });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const bookId = parseInt(String(req.params.id), 10);

    // Validate bookId
    if (isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid book ID",
        },
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "No cover image provided",
        },
      });
    }

    // Check if book exists
    const existingBook = await getBookById(bookId);

    if (!existingBook) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Book not found",
        },
      });
    }

    try {
      // Construct relative cover path
      const coverPath = `covers/${req.file.filename}`;

      // Update book with new cover path
      await updateBook(bookId, { cover_path: coverPath });

      // Emit WebSocket event
      emitBookUpdated(bookId, { coverUpdated: true });

      logger.info("Book cover uploaded", {
        event: "book_cover_uploaded",
        bookId,
        coverPath,
        userId: req.user!.id,
        username: req.user!.username,
      });

      return res.json({
        data: {
          bookId,
          coverPath,
        },
      });
    } catch (error) {
      logger.error("Failed to upload book cover", {
        event: "book_cover_upload_failed",
        bookId,
        error,
      });

      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to upload cover",
        },
      });
    }
  },
);

/**
 * GET /api/v1/books
 * List books with visibility filtering based on user role (AC #2, #3, #5)
 * - Admin sees all books with visibility field
 * - User sees only public books (visibility field omitted)
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userRole = req.user!.role;

  // Apply visibility filter based on role
  const filter = applyVisibilityFilter(userRole);

  let query = db.select().from(books);
  if (filter) {
    query = query.where(filter) as any;
  }

  const bookList = await query;

  // Format response based on role (AC #5, Task 6)
  const data = bookList.map((book) =>
    transformBook(book, userRole === "admin"),
  );

  return res.json({ data });
});

/**
 * GET /api/v1/books/:id/cover
 * Serve cover image for a book (Story 3.12: AC #1, #3)
 * Any authenticated user can access covers
 */
router.get("/:id/cover", requireAuth, async (req: Request, res: Response) => {
  const bookId = parseInt(String(req.params.id), 10);

  if (isNaN(bookId) || bookId <= 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid book ID",
      },
    });
  }

  const book = await getBookById(bookId);

  if (!book) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Book not found",
      },
    });
  }

  // Check if book has a cover
  if (!book.cover_path) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Cover not found",
      },
    });
  }

  // Construct full path to cover file
  const coverFullPath = path.join(process.cwd(), "data", book.cover_path);

  // Check if file exists
  if (!fs.existsSync(coverFullPath)) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Cover file not found",
      },
    });
  }

  // Determine content type based on file extension
  const ext = path.extname(coverFullPath).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const contentType = contentTypeMap[ext] || "application/octet-stream";

  // Set cache headers
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");

  // Stream the file
  const fileStream = fs.createReadStream(coverFullPath);
  fileStream.pipe(res);
});

/**
 * GET /api/v1/books/:id
 * Get a single book by ID with visibility check
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const bookId = parseInt(String(req.params.id), 10);
  const userRole = req.user!.role;

  if (isNaN(bookId) || bookId <= 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid book ID",
      },
    });
  }

  const book = await getBookById(bookId);

  if (!book) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Book not found",
      },
    });
  }

  // Check visibility access
  if (userRole !== "admin" && book.visibility === "private") {
    // User cannot see private content - return 404 to not reveal existence
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Book not found",
      },
    });
  }

  // Format response based on role
  const data = transformBook(book, userRole === "admin");

  return res.json({ data });
});

export default router;
