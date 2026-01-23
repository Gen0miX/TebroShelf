import { app } from "./app.js";
import { db } from "./db/index.js";
import { seedAdmin } from "./scripts/seed.js";
import { startScheduler, stopScheduler } from "./workers/scheduler.js";
import { startFileWatcher, stopFileWatcher } from "./workers/fileWatcher.js";
import { processDetectedFile } from "./services/file/fileProcessor.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.PORT || 3000;

// Initialize database connection on startup
console.log("Database initialized:", db ? "OK" : "FAILED");

// Run initial seeding
seedAdmin().then(() => {
  // Start background workers (Story 1.5 - Session cleanup scheduler)
  startScheduler();

  const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // Start file watcher (Epic 2 - File watching service)
  const fileWatcherInstance = startFileWatcher(async (event) => {
    try {
      const result = await processDetectedFile(event);
      if (result.action === "created") {
        logger.info("File processed successfully", {
          context: "main",
          filename: event.filename,
          bookId: result.bookId,
        });
      } else if (result.action === "skipped") {
        logger.info("File skipped", {
          context: "main",
          filename: event.filename,
          reason: result.reason,
        });
      } else {
        logger.warn("File processing failed", {
          context: "main",
          filename: event.filename,
          reason: result.reason,
        });
      }
    } catch (err) {
      logger.error("Unexpected error processing detected file", {
        context: "main",
        filename: event.filename,
        error: err as Error,
      });
    }
  });

  // Graceful shutdown handler (prevents resource leaks from scheduler interval)
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    stopScheduler();
    await stopFileWatcher();
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
