import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../services/auth/passwordService';

describe('Auth Logout - Integration Tests (Story 1.5)', () => {
  const testUsername = `logout_int_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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

  describe('AC #1: Session invalidated on logout', () => {
    it('should delete session from database when logging out', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'testpassword123' });
      expect(loginResponse.status).toBe(200);

      const cookies = loginResponse.headers['set-cookie'];
      const sessionCookie = (cookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      const token = sessionCookie?.split('=')[1]?.split(';')[0];

      // Verify session exists in DB
      const sessionsBefore = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token!));
      expect(sessionsBefore.length).toBe(1);

      // Logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${token}`)
        .expect(200);

      expect(logoutResponse.body.data.message).toBe('Logged out successfully');

      // Verify session is deleted from DB
      const sessionsAfter = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token!));
      expect(sessionsAfter.length).toBe(0);
    });
  });

  describe('AC #2: Session cookie cleared on logout', () => {
    it('should clear the session cookie after logout', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'testpassword123' });

      const loginCookies = loginResponse.headers['set-cookie'];
      const sessionCookie = (loginCookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      const token = sessionCookie?.split('=')[1]?.split(';')[0];

      // Logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${token}`);

      // Check cookie is cleared
      const logoutCookies = logoutResponse.headers['set-cookie'];
      const clearedCookie = (logoutCookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      expect(clearedCookie).toMatch(/session=;|Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('AC #3: Access denied after logout', () => {
    it('should return 401 when accessing protected endpoints after logout', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'testpassword123' });

      const cookies = loginResponse.headers['set-cookie'];
      const sessionCookie = (cookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      const token = sessionCookie?.split('=')[1]?.split(';')[0];

      // Verify access works before logout
      const beforeLogout = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${token}`)
        .expect(200);
      expect(beforeLogout.body.data.username).toBe(testUsername);

      // Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${token}`)
        .expect(200);

      // Verify access denied after logout
      const afterLogout = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${token}`)
        .expect(401);
      expect(afterLogout.body.error.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('Idempotent logout (Task 6.5)', () => {
    it('should return 200 even when logging out without a session', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body.data.message).toBe('Logged out successfully');
    });

    it('should return 200 when logging out with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', 'session=' + 'x'.repeat(64))
        .expect(200);

      expect(response.body.data.message).toBe('Logged out successfully');
    });
  });

  describe('Full E2E logout flow', () => {
    it('should complete login → use → logout → denied flow', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'testpassword123' })
        .expect(200);

      const cookies = loginResponse.headers['set-cookie'];
      const sessionCookie = (cookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      const token = sessionCookie?.split('=')[1]?.split(';')[0];

      // 2. Access protected resource
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${token}`)
        .expect(200);

      // 3. Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${token}`)
        .expect(200);

      // 4. Try to access again - should fail
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${token}`)
        .expect(401);

      // 5. Can login again
      const secondLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'testpassword123' })
        .expect(200);

      const newCookies = secondLogin.headers['set-cookie'];
      const newSessionCookie = (newCookies as unknown as string[] | undefined)?.find((c: string) => c.startsWith('session='));
      const newToken = newSessionCookie?.split('=')[1]?.split(';')[0];

      // 6. New session should work
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${newToken}`)
        .expect(200);

      // Cleanup
      await db.delete(sessions).where(eq(sessions.token, newToken!));
    });
  });
});
