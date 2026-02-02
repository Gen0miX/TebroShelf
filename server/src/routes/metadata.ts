import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/roleGuard";
import {
  searchMetadata,
  getAvailableSources,
  MetadataSource,
} from "../services/metadata/metadataSearchService";
import { updateBook, getBookById } from "../services/library/bookService";
import { emitBookUpdated } from "../websocket/event";
import { applyMetadata } from "../services/metadata/metadataApplyService";
import { logger } from "../utils/logger";

const router = Router();

// All metadata routes require admin access
router.use(requireAuth);
router.use(requireAdmin);

const searchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  source: z.enum([
    "openlibrary",
    "googlebooks",
    "anilist",
    "myanimelist",
    "mangadex",
  ]),
});

const applySchema = z.object({
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  genres: z.array(z.string()).optional(),
  publicationDate: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  volume: z.number().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  source: z.enum([
    "openlibrary",
    "googlebooks",
    "anilist",
    "myanimelist",
    "mangadex",
  ]),
  externalId: z.string(),
});

/**
 * GET /api/v1/metadata/search?query=...&source=...
 * Search for metadata across available API sources
 */
router.get("/search", async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid search parameters",
        details: parsed.error.issues,
      },
    });
  }

  const { query, source } = parsed.data;
  const results = await searchMetadata(query, source as MetadataSource);

  return res.json({ data: results });
});

/**
 * GET /api/v1/metadata/sources
 * List available/configured metadata sources
 */
router.get("/sources", async (req, res) => {
  const sources = getAvailableSources();
  return res.json({ data: sources });
});

/**
 * POST /api/v1/metadata/:bookId/apply
 * Apply selected metadata to a book
 */
router.post("/:bookId/apply", async (req, res) => {
  const bookId = parseInt(req.params.bookId, 10);
  if (isNaN(bookId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid book ID" },
    });
  }

  const book = await getBookById(bookId);
  if (!book) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Book not found" },
    });
  }

  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid metadata",
        details: parsed.error.issues,
      },
    });
  }

  const { source, externalId, ...metadata } = parsed.data;

  const result = await applyMetadata(bookId, metadata);

  emitBookUpdated(bookId, {
    source,
    externalId,
    fieldsUpdated: result.fieldsUpdated,
  });

  return res.json({ data: result });
});

export default router;
