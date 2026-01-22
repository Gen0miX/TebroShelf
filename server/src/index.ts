import { app } from "./app.js";
import { db } from "./db/index.js";
import { seedAdmin } from "./scripts/seed.js";
import { startScheduler, stopScheduler } from "./workers/scheduler.js";
import { startFileWatcher, stopFileWatcher } from "./workers/fileWatcher.js";
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
    //Placeholder callback - will be replaced in Story 2.3/2.4
    logger.info("File detected by watcher", {
      context: "fileWatcher",
      filename: event.filename,
      extension: event.extension,
    });
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
