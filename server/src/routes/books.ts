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
import { logger } from "../utils/logger";

const router = Router();

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

    // Fetch updated book
    const [updatedBook] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId));

    logger.info("Book visibility updated", {
      event: "book_visibility_updated",
      bookId,
      visibility: parsed.data.visibility,
      userId: req.user!.id,
      username: req.user!.username,
    });

    return res.json({
      data: {
        id: updatedBook.id,
        title: updatedBook.title,
        author: updatedBook.author,
        visibility: updatedBook.visibility,
        updated_at: updatedBook.updated_at.toISOString(),
      },
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
  if (userRole === "admin") {
    // Admin sees all books with visibility indicator
    const data = bookList.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      file_path: book.file_path,
      file_type: book.file_type,
      content_type: book.content_type,
      cover_path: book.cover_path,
      status: book.status,
      visibility: book.visibility,
      isPrivate: book.visibility === "private",
      created_at: book.created_at.toISOString(),
      updated_at: book.updated_at.toISOString(),
    }));

    return res.json({ data });
  } else {
    // Regular users see only public content, visibility field omitted
    const data = bookList.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      file_path: book.file_path,
      file_type: book.file_type,
      content_type: book.content_type,
      cover_path: book.cover_path,
      status: book.status,
      created_at: book.created_at.toISOString(),
      updated_at: book.updated_at.toISOString(),
    }));

    return res.json({ data });
  }
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

  const [book] = await db.select().from(books).where(eq(books.id, bookId));

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
  if (userRole === "admin") {
    return res.json({
      data: {
        id: book.id,
        title: book.title,
        author: book.author,
        file_path: book.file_path,
        file_type: book.file_type,
        content_type: book.content_type,
        cover_path: book.cover_path,
        status: book.status,
        visibility: book.visibility,
        isPrivate: book.visibility === "private",
        created_at: book.created_at.toISOString(),
        updated_at: book.updated_at.toISOString(),
      },
    });
  } else {
    return res.json({
      data: {
        id: book.id,
        title: book.title,
        author: book.author,
        file_path: book.file_path,
        file_type: book.file_type,
        content_type: book.content_type,
        cover_path: book.cover_path,
        status: book.status,
        created_at: book.created_at.toISOString(),
        updated_at: book.updated_at.toISOString(),
      },
    });
  }
});

export default router;
