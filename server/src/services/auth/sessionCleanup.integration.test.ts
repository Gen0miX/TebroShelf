import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup';
import { db } from '../../db';
import { users, sessions } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './passwordService';

describe('Session Cleanup Service - Integration Tests (Story 1.5)', () => {
  const testUsername = `cleanup_int_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let testUserId: number;

  beforeAll(async () => {
    // Create test user
    const passwordHash = await hashPassword('testpassword123');
    const [user] = await db.insert(users).values({
      username: testUsername,
      password_hash: passwordHash,
      role: 'user',
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(sessions).where(eq(sessions.user_id, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('cleanupExpiredSessions (AC #6)', () => {
    it('should delete expired sessions from database', async () => {
      // Create expired session (1 day ago)
      const expiredToken1 = 'expired1_' + 'a'.repeat(55);
      const expiredToken2 = 'expired2_' + 'b'.repeat(55);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await db.insert(sessions).values([
        { user_id: testUserId, token: expiredToken1, expires_at: pastDate },
        { user_id: testUserId, token: expiredToken2, expires_at: pastDate },
      ]);

      // Run cleanup
      const deletedCount = await cleanupExpiredSessions();

      // Should have deleted at least 2 expired sessions
      expect(deletedCount).toBeGreaterThanOrEqual(2);

      // Verify sessions are gone
      const remainingExpired = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, expiredToken1));
      expect(remainingExpired.length).toBe(0);
    });

    it('should NOT delete valid non-expired sessions', async () => {
      // Create valid session (expires in 7 days)
      const validToken = 'valid_' + 'c'.repeat(58);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        user_id: testUserId,
        token: validToken,
        expires_at: futureDate,
      });

      // Run cleanup
      await cleanupExpiredSessions();

      // Valid session should still exist
      const remainingValid = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, validToken));
      expect(remainingValid.length).toBe(1);

      // Cleanup valid session
      await db.delete(sessions).where(eq(sessions.token, validToken));
    });

    it('should return 0 when no expired sessions exist', async () => {
      // Create only valid sessions
      const validToken = 'noexpire_' + 'd'.repeat(55);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        user_id: testUserId,
        token: validToken,
        expires_at: futureDate,
      });

      // Run cleanup - should return 0 since no expired sessions
      const deletedCount = await cleanupExpiredSessions();
      expect(deletedCount).toBe(0);

      // Cleanup
      await db.delete(sessions).where(eq(sessions.token, validToken));
    });

    it('should handle mixed expired and valid sessions correctly', async () => {
      const expiredToken = 'mixed_exp_' + 'e'.repeat(54);
      const validToken = 'mixed_val_' + 'f'.repeat(54);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values([
        { user_id: testUserId, token: expiredToken, expires_at: pastDate },
        { user_id: testUserId, token: validToken, expires_at: futureDate },
      ]);

      // Run cleanup
      const deletedCount = await cleanupExpiredSessions();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Expired should be gone
      const remainingExpired = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, expiredToken));
      expect(remainingExpired.length).toBe(0);

      // Valid should remain
      const remainingValid = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, validToken));
      expect(remainingValid.length).toBe(1);

      // Cleanup
      await db.delete(sessions).where(eq(sessions.token, validToken));
    });
  });
});
