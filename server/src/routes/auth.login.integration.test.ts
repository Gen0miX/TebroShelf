import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../services/auth/passwordService';

describe('Auth Login - Integration Tests (Story 1.4)', () => {
  let testUsername: string;
  const testPassword = 'Password123!';
  let testUserId: number;

  beforeEach(async () => {
    // Create a unique test user for each test to avoid parallel test conflicts
    testUsername = `login_int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashPassword(testPassword);
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

  describe('AC #1: Password verification against bcrypt hash', () => {
    it('should verify password correctly with bcrypt and create session', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.username).toBe(testUsername);
    });
  });

  describe('AC #2: Session created and stored in database', () => {
    it('should create session record in sessions table on successful login', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      // Verify session exists in database
      const userSessions = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId));

      expect(userSessions.length).toBeGreaterThan(0);
      expect(userSessions[0].token).toHaveLength(64);
      expect(userSessions[0].expires_at).toBeInstanceOf(Date);
      expect(userSessions[0].expires_at.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('AC #3: httpOnly cookie set with session token', () => {
    it('should set httpOnly cookie on successful login', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const sessionCookie = cookies.find((c: string) => c.startsWith('session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).toContain('Path=/');
    });
  });

  describe('AC #5: Generic error message for invalid credentials', () => {
    it('should return same generic error for invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('should return same generic error for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'anypassword123' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid username or password');
    });
  });

  describe('AC #6: Session validation and user context', () => {
    it('should validate session and return user on /me endpoint', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      const cookies = loginResponse.headers['set-cookie'];

      // Access /me with the session cookie
      const meResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(meResponse.body.data).toBeDefined();
      expect(meResponse.body.data.id).toBe(testUserId);
      expect(meResponse.body.data.username).toBe(testUsername);
      expect(meResponse.body.data.role).toBe('user');
    });

    it('should return 401 on /me without session cookie', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Full login flow E2E', () => {
    it('should complete full login → authenticated request flow', async () => {
      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      expect(loginResponse.body.data.username).toBe(testUsername);
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();

      // Step 2: Access protected resource
      const meResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(meResponse.body.data.username).toBe(testUsername);

      // Step 3: Verify session exists in DB
      const [session] = await db.select().from(sessions)
        .where(eq(sessions.user_id, testUserId))
        .limit(1);

      expect(session).toBeDefined();
      expect(session.token).toHaveLength(64);
    });
  });
});
