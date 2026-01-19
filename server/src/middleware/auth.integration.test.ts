import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../services/auth/passwordService';

describe('Auth Middleware - Integration Tests (Story 1.5)', () => {
  const testUsername = `auth_mid_int_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let testUserId: number;
  let validToken: string;

  beforeAll(async () => {
    // Create test user
    const passwordHash = await hashPassword('testpassword123');
    const [user] = await db.insert(users).values({
      username: testUsername,
      password_hash: passwordHash,
      role: 'user',
    }).returning();
    testUserId = user.id;

    // Login to get a valid session
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: testUsername, password: 'testpassword123' });

    const cookies = loginResponse.headers['set-cookie'] as unknown as string[] | undefined;
    const sessionCookie = cookies?.find((c: string) => c.startsWith('session='));
    validToken = sessionCookie?.split('=')[1]?.split(';')[0] || '';
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(sessions).where(eq(sessions.user_id, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('AC #4, #5: Session Expiry Handling', () => {
    it('should reject requests with expired session and clear cookie', async () => {
      // Create an expired session manually
      const expiredToken = 'e'.repeat(64);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

      await db.insert(sessions).values({
        user_id: testUserId,
        token: expiredToken,
        expires_at: pastDate,
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('SESSION_EXPIRED');
      expect(response.body.error.message).toBe('Session expired. Please log in again.');

      // Verify cookie is cleared
      const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookies).toBeDefined();
      const sessionCookie = cookies?.find((c: string) => c.startsWith('session='));
      expect(sessionCookie).toMatch(/session=;|Expires=Thu, 01 Jan 1970/);

      // Cleanup expired session
      await db.delete(sessions).where(eq(sessions.token, expiredToken));
    });

    it('should accept requests with valid non-expired session', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${validToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.username).toBe(testUsername);
    });

    it('should reject requests after session is deleted (logout scenario)', async () => {
      // Create a session, then delete it
      const tempToken = 'f'.repeat(64);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        user_id: testUserId,
        token: tempToken,
        expires_at: futureDate,
      });

      // First verify session works
      const validResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${tempToken}`)
        .expect(200);
      expect(validResponse.body.data.username).toBe(testUsername);

      // Delete the session (simulating logout)
      await db.delete(sessions).where(eq(sessions.token, tempToken));

      // Now the same token should be rejected
      const invalidResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${tempToken}`)
        .expect(401);

      expect(invalidResponse.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('should return UNAUTHORIZED for missing session vs SESSION_EXPIRED for invalid', async () => {
      // No cookie at all
      const noTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);
      expect(noTokenResponse.body.error.code).toBe('UNAUTHORIZED');
      expect(noTokenResponse.body.error.message).toBe('Authentication required');

      // Invalid token format
      const badTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', 'session=invalid-token')
        .expect(401);
      expect(badTokenResponse.body.error.code).toBe('SESSION_EXPIRED');
    });
  });
});
