import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { books } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/roleGuard";
import { transformBook } from "./books";

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

export default router;
