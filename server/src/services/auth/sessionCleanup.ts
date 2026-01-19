import { db } from '../../db';
import { sessions } from '../../db/schema';
import { lt } from 'drizzle-orm';
import { logger } from '../../utils/logger';

/**
 * Removes all expired sessions from the database (AC #6).
 * Sessions are considered expired when expires_at < current time.
 * @returns The number of deleted sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expires_at, new Date()))
    .returning({ id: sessions.id });

  const count = result.length;

  if (count > 0) {
    logger.info(`Cleaned up ${count} expired sessions`, { context: 'session-cleanup', count });
  }

  return count;
}
