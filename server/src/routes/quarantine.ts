import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { books } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/roleGuard";
import { transformBook } from "./books";
import { getBookById, updateBook } from "../services/library/bookService";
import { emitBookUpdated } from "../websocket/event";
import { logger } from "../utils/logger";

const router = Router();

// All quarantine routes require admin access
router.use(requireAuth);
router.use(requireAdmin);

/**
 * Get /api/v1/quarantine
 * List all quarantined items, sorted by created_at DESC (newest first);
 */
router.get("/", async (req, res) => {
  const quarantinedBooks = await db
    .select()
    .from(books)
    .where(eq(books.status, "quarantine"))
    .orderBy(desc(books.created_at));

  const data = quarantinedBooks.map((book) => transformBook(book, true));

  return res.json({
    data,
    meta: { total: quarantinedBooks.length },
  });
});

/**
 * Get /api/v1/quarantine/count
 * Get count of quarantined items (for badge)
 */
router.get("/count", async (req, res) => {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .where(eq(books.status, "quarantine"));

  return res.json({
    data: { count: result.count },
  });
});

/**
 * POST /api/v1/quarantine/:id/approve
 * Validate quarantined content and move it to the main library.
 * Admin only.
 */
router.post("/:id/approve", async (req, res) => {
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

  if (book.status !== "quarantine") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Book is not in quarantine",
        details: { currentStatus: book.status },
      },
    });
  }

  try {
    // Move from quarantine to enriched
    const updatedBook = await updateBook(bookId, {
      status: "enriched",
      failure_reason: null,
    });

    // Emit WebSocket event (fire-and-forget - don't fail the request if broadcast fails)
    try {
      emitBookUpdated(bookId, {
        status: "enriched",
        previousStatus: "quarantine",
      });
    } catch (wsError) {
      logger.warn("Failed to emit book.updated WebSocket event", {
        context: "quarantine",
        bookId,
        error:
          wsError instanceof Error
            ? { name: wsError.name, message: wsError.message }
            : wsError,
      });
    }

    logger.info("Book approved from quarantine", {
      context: "quarantine",
      bookId,
      userId: req.user!.id,
      username: req.user!.username,
      previousStatus: "quarantine",
      newStatus: "enriched",
    });

    // Transform book for response
    const transformed = transformBook(updatedBook, true);

    return res.json({ data: transformed });
  } catch (error) {
    logger.error("Failed to approve book from quarantine", {
      context: "quarantine",
      bookId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    });

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to approve book",
      },
    });
  }
});

export default router;
