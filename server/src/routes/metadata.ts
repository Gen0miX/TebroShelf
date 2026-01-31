import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/roleGuard";
import {
  searchMetadata,
  getAvailableSources,
  MetadataSource,
} from "../services/metadata/metadataSearchService";

const router = Router();

// All metadata routes require admin access
router.use(requireAuth);
router.use(requireAdmin);

const searchSchema = z.object({
    query: z.string().min(1, "Search query is required"),
    source: z.enum(["openlibrary", "googlebooks", "anilist", "myanimelist", "mangadex"]),
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
        message: "Invalide search parameters",
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
router.get("/sources", async(req, res) => {
    const sources = getAvailableSources();
    return res.json({data: sources});
});

export default router;
