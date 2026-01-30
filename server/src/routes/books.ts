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
import { getBookById } from "../services/library/bookService";
import { logger } from "../utils/logger";

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
