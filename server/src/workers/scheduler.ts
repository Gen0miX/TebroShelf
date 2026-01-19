import { cleanupExpiredSessions } from '../services/auth/sessionCleanup';
import { logger } from '../utils/logger';

// Default: 1 hour (configurable via env)
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let cleanupIntervalId: NodeJS.Timeout | null = null;
let intervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS;

/**
 * Get the configured cleanup interval from environment.
 * Defaults to 1 hour if not set or invalid.
 */
function getCleanupIntervalMs(): number {
  const envValue = process.env.SESSION_CLEANUP_INTERVAL_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CLEANUP_INTERVAL_MS;
}

/**
 * Start the session cleanup scheduler.
 * Runs cleanup immediately on startup, then periodically (AC #6).
 */
export function startScheduler(): void {
  // Prevent starting multiple schedulers
  if (cleanupIntervalId !== null) {
    logger.warn('Scheduler already running', { context: 'scheduler' });
    return;
  }

  intervalMs = getCleanupIntervalMs();

  logger.info(`Session cleanup scheduled every ${intervalMs / 1000}s`, { context: 'scheduler', intervalMs });

  // Run cleanup on startup (Task 4.4)
  cleanupExpiredSessions().catch((err) => {
    logger.error('Session cleanup failed on startup', { context: 'scheduler', error: err as Error });
  });

  // Schedule periodic cleanup (Task 4.2, 4.3)
  cleanupIntervalId = setInterval(async () => {
    try {
      await cleanupExpiredSessions();
    } catch (err) {
      logger.error('Scheduled session cleanup failed', { context: 'scheduler', error: err as Error });
    }
  }, intervalMs);
}

/**
 * Stop the session cleanup scheduler.
 */
export function stopScheduler(): void {
  if (cleanupIntervalId !== null) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Session cleanup scheduler stopped', { context: 'scheduler' });
  }
}

/**
 * Get the current scheduler status.
 */
export function getSchedulerStatus(): { running: boolean; intervalMs: number } {
  return {
    running: cleanupIntervalId !== null,
    intervalMs,
  };
}
