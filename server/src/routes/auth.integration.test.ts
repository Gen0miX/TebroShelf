import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';
import { users } from '../db/schema';
import { sql } from 'drizzle-orm';

/**
 * Integration tests that use the real SQLite database.
 * These tests verify actual DB operations including:
 * - Password hashing stored correctly
 * - Unique constraint enforcement
 * - Data persistence
 */
describe('Auth Routes - Integration Tests', () => {
  beforeEach(async () => {
    // Clean up users table before each test
    await db.delete(users);
  });

  afterEach(async () => {
    // Clean up after tests
    await db.delete(users);
  });

  describe('POST /api/v1/auth/register - Real DB', () => {
    it('should create user with bcrypt-hashed password in database', async () => {
      const newUser = { username: 'integration_test', password: 'securepass123', role: 'user' };

      const response = await request(app)
        .post('/api/v1/auth/register')
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
        .send(user);
      expect(first.status).toBe(201);

      // Second registration with same username
      const second = await request(app)
        .post('/api/v1/auth/register')
        .send(user);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('USERNAME_EXISTS');
    });

    it('should persist user data correctly', async () => {
      const newUser = { username: 'persist_test', password: 'password123', role: 'admin' };

      await request(app)
        .post('/api/v1/auth/register')
        .send(newUser);

      const [dbUser] = await db.select().from(users).where(sql`username = 'persist_test'`);

      expect(dbUser.username).toBe('persist_test');
      expect(dbUser.role).toBe('admin');
      expect(dbUser.created_at).toBeInstanceOf(Date);
      expect(dbUser.updated_at).toBeInstanceOf(Date);
    });
  });
});
