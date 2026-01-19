import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { users, sessions } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './passwordService';
import * as sessionService from './sessionService';

describe('Session Service - Integration Tests (Story 1.4)', () => {
  let testUserId: number;
  let testUsername: string;

  beforeEach(async () => {
    // Create unique test user
    testUsername = `session_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashPassword('TestPassword123!');
    const [user] = await db.insert(users).values({
      username: testUsername,
      password_hash: passwordHash,
      role: 'user',
    }).returning();
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testUserId) {
      try {
        await db.delete(sessions).where(eq(sessions.user_id, testUserId));
        await db.delete(users).where(eq(users.id, testUserId));
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('createSession', () => {
    it('should create session in database and return token with expiry', async () => {
      const result = await sessionService.createSession(testUserId);

      expect(result.token).toHaveLength(64);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify session exists in DB
      const [dbSession] = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId))
        .limit(1);

      expect(dbSession).toBeDefined();
      expect(dbSession.token).toBe(result.token);
    });

    it('should allow multiple sessions for same user', async () => {
      const session1 = await sessionService.createSession(testUserId);
      const session2 = await sessionService.createSession(testUserId);

      expect(session1.token).not.toBe(session2.token);

      const userSessions = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId));

      expect(userSessions.length).toBe(2);
    });
  });

  describe('validateSession', () => {
    it('should return session with user data for valid token', async () => {
      const { token } = await sessionService.createSession(testUserId);

      const result = await sessionService.validateSession(token);

      expect(result).not.toBeNull();
      expect(result!.user.id).toBe(testUserId);
      expect(result!.user.username).toBe(testUsername);
      expect(result!.user.role).toBe('user');
      expect(result!.session.token).toBe(token);
    });

    it('should return null for non-existent token', async () => {
      const fakeToken = 'a'.repeat(64);
      const result = await sessionService.validateSession(fakeToken);
      expect(result).toBeNull();
    });

    it('should return null for invalid token format', async () => {
      const result = await sessionService.validateSession('invalid-short-token');
      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      // Create session with past expiry directly in DB
      const expiredToken = sessionService.generateSecureToken();
      await db.insert(sessions).values({
        user_id: testUserId,
        token: expiredToken,
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      });

      const result = await sessionService.validateSession(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete session from database', async () => {
      const { token } = await sessionService.createSession(testUserId);

      // Verify it exists
      const beforeDelete = await db.select().from(sessions)
        .where(eq(sessions.token, token));
      expect(beforeDelete.length).toBe(1);

      // Delete it
      await sessionService.deleteSession(token);

      // Verify it's gone
      const afterDelete = await db.select().from(sessions)
        .where(eq(sessions.token, token));
      expect(afterDelete.length).toBe(0);
    });

    it('should not throw error for non-existent token', async () => {
      const fakeToken = 'b'.repeat(64);
      await expect(sessionService.deleteSession(fakeToken)).resolves.not.toThrow();
    });
  });

  describe('deleteUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      // Create multiple sessions
      await sessionService.createSession(testUserId);
      await sessionService.createSession(testUserId);
      await sessionService.createSession(testUserId);

      const beforeDelete = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId));
      expect(beforeDelete.length).toBe(3);

      // Delete all
      await sessionService.deleteUserSessions(testUserId);

      const afterDelete = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId));
      expect(afterDelete.length).toBe(0);
    });

    it('should not affect other users sessions', async () => {
      // Create another user
      const otherUsername = `other_${Date.now()}`;
      const [otherUser] = await db.insert(users).values({
        username: otherUsername,
        password_hash: 'hash',
        role: 'user',
      }).returning();

      await sessionService.createSession(testUserId);
      await sessionService.createSession(otherUser.id);

      // Delete only testUser sessions
      await sessionService.deleteUserSessions(testUserId);

      const testUserSessions = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId));
      const otherUserSessions = await db.select().from(sessions)
        .where(eq(sessions.user_id, otherUser.id));

      expect(testUserSessions.length).toBe(0);
      expect(otherUserSessions.length).toBe(1);

      // Cleanup other user
      await db.delete(sessions).where(eq(sessions.user_id, otherUser.id));
      await db.delete(users).where(eq(users.id, otherUser.id));
    });
  });
});
