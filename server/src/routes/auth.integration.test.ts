import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { sql } from 'drizzle-orm';
import { hashPassword } from '../services/auth/passwordService';
import { createSession } from '../services/auth/sessionService';

/**
 * Integration tests that use the real SQLite database.
 * These tests verify actual DB operations including:
 * - Password hashing stored correctly
 * - Unique constraint enforcement
 * - Data persistence
 *
 * Updated for Story 1.6: /register now requires admin authentication
 */
describe('Auth Routes - Integration Tests', () => {
  let adminSessionToken: string;

  beforeEach(async () => {
    // Clean up tables before each test
    await db.delete(sessions);
    await db.delete(users);

    // Create an admin user for authenticated requests
    const adminPasswordHash = await hashPassword('adminpass123');
    const [adminUser] = await db.insert(users).values({
      username: 'test_admin',
      password_hash: adminPasswordHash,
      role: 'admin',
    }).returning();

    // Create a session for the admin
    const sessionData = await createSession(adminUser.id);
    adminSessionToken = sessionData.token;
  });

  afterEach(async () => {
    // Clean up after tests
    await db.delete(sessions);
    await db.delete(users);
  });

  describe('POST /api/v1/auth/register - Real DB (admin-only)', () => {
    it('should create user with bcrypt-hashed password in database', async () => {
      const newUser = { username: 'integration_test', password: 'securepass123', role: 'user' };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', `session=${adminSessionToken}`)
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.data.username).toBe('integration_test');
      expect(response.body.data).not.toHaveProperty('password_hash');

      // Verify in database
      const [dbUser] = await db.select().from(users).where(sql`username = 'integration_test'`);
      expect(dbUser).toBeDefined();
      expect(dbUser.password_hash).toMatch(/^\$2b\$/); // bcrypt prefix
      expect(dbUser.password_hash).not.toBe(newUser.password); // Not plain text
    });

    it('should enforce unique username constraint at DB level', async () => {
      const user = { username: 'unique_test', password: 'password123', role: 'user' };

      // First registration
      const first = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', `session=${adminSessionToken}`)
        .send(user);
      expect(first.status).toBe(201);

      // Second registration with same username
      const second = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', `session=${adminSessionToken}`)
        .send(user);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('USERNAME_EXISTS');
    });

    it('should persist user data correctly', async () => {
      const newUser = { username: 'persist_test', password: 'password123', role: 'admin' };

      await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', `session=${adminSessionToken}`)
        .send(newUser);

      const [dbUser] = await db.select().from(users).where(sql`username = 'persist_test'`);

      expect(dbUser.username).toBe('persist_test');
      expect(dbUser.role).toBe('admin');
      expect(dbUser.created_at).toBeInstanceOf(Date);
      expect(dbUser.updated_at).toBeInstanceOf(Date);
    });

    // New test for Story 1.6: AC #4 - unauthenticated receives 401
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ username: 'test', password: 'test1234', role: 'user' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    // New test for Story 1.6: AC #1 - regular user receives 403
    it('should return 403 for non-admin user', async () => {
      // Create a regular user
      const userPasswordHash = await hashPassword('userpass123');
      const [regularUser] = await db.insert(users).values({
        username: 'regular_user',
        password_hash: userPasswordHash,
        role: 'user',
      }).returning();

      // Create session for regular user
      const userSessionData = await createSession(regularUser.id);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', `session=${userSessionData.token}`)
        .send({ username: 'newuser', password: 'pass1234', role: 'user' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
