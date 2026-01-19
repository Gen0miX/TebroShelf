import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { users, sessions } from '../../db/schema';
import * as sessionService from './sessionService';

// Mock the db module
let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle>;

// We'll test the functions with a real in-memory database
describe('Session Service (Story 1.4)', () => {
  let testUserId: number;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    testDb = drizzle(sqlite, { schema: { users, sessions } });

    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_users_username ON users (username);

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_token ON sessions (token);
      CREATE INDEX idx_sessions_user_id ON sessions (user_id);
    `);

    // Create test user
    const now = new Date();
    const result = testDb
      .insert(users)
      .values({
        username: 'testuser',
        password_hash: 'hashed_password',
        role: 'user',
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();
    testUserId = result!.id;
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('createSession', () => {
    it('should generate a secure random token', async () => {
      // Token should be 64 hex characters (32 bytes)
      const token = sessionService.generateSecureToken();
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens on each call', () => {
      const token1 = sessionService.generateSecureToken();
      const token2 = sessionService.generateSecureToken();
      expect(token1).not.toBe(token2);
    });

    it('should calculate correct expiry date based on days', () => {
      const days = 7;
      const before = Date.now();
      const expiresAt = sessionService.calculateExpiryDate(days);
      const after = Date.now();

      const expectedMinMs = before + days * 24 * 60 * 60 * 1000;
      const expectedMaxMs = after + days * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
    });
  });

  describe('Session expiry configuration', () => {
    it('should use default 7 days expiry', () => {
      const defaultDays = sessionService.getSessionExpiryDays();
      expect(defaultDays).toBe(7);
    });
  });

  describe('Token validation helpers', () => {
    it('should validate token format correctly', () => {
      const validToken = 'a'.repeat(64);
      const invalidShort = 'abc';
      const invalidChars = 'g'.repeat(64); // 'g' is not hex

      expect(sessionService.isValidTokenFormat(validToken)).toBe(true);
      expect(sessionService.isValidTokenFormat(invalidShort)).toBe(false);
      expect(sessionService.isValidTokenFormat(invalidChars)).toBe(false);
    });
  });
});
