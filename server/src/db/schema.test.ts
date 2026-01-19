import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { users, sessions } from './schema';
import type { User, NewUser, UserRole, Session, NewSession } from './schema';

describe('User Schema (Story 1.2)', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    // Use in-memory database for tests
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema: { users, sessions } });

    // Create table with CHECK constraint
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL CHECK(role IN ('admin', 'user')),
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
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('AC #1: Users table columns', () => {
    it('should have all required columns: id, username, password_hash, role, created_at, updated_at', () => {
      const tableInfo = sqlite.pragma('table_info(users)') as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('password_hash');
      expect(columnNames).toContain('role');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should insert user with all fields populated', () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: 'testuser_ac1',
          password_hash: 'hashed_password',
          role: 'user',
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result).toBeDefined();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.username).toBe('testuser_ac1');
      expect(result!.password_hash).toBe('hashed_password');
      expect(result!.role).toBe('user');
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('AC #2: Role constraint', () => {
    it('should accept "admin" role', () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: 'admin_user',
          password_hash: 'hash',
          role: 'admin',
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.role).toBe('admin');
    });

    it('should accept "user" role', () => {
      const now = new Date();
      const result = db
        .insert(users)
        .values({
          username: 'normal_user',
          password_hash: 'hash',
          role: 'user',
          created_at: now,
          updated_at: now,
        })
        .returning()
        .get();

      expect(result!.role).toBe('user');
    });

    it('should reject invalid role values', () => {
      const now = new Date();
      expect(() => {
        db.insert(users)
          .values({
            username: 'invalid_role_user',
            password_hash: 'hash',
            role: 'superuser' as any, // Testing runtime constraint with invalid role
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe('AC #3: Unique username constraint', () => {
    it('should reject duplicate usernames', () => {
      const now = new Date();
      const username = 'duplicate_test_user';

      // First insert should succeed
      db.insert(users)
        .values({
          username,
          password_hash: 'hash1',
          role: 'user',
          created_at: now,
          updated_at: now,
        })
        .run();

      // Second insert with same username should fail
      expect(() => {
        db.insert(users)
          .values({
            username,
            password_hash: 'hash2',
            role: 'user',
            created_at: now,
            updated_at: now,
          })
          .run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('AC #4: TypeScript type inference', () => {
    it('should export User type with correct shape', () => {
      const user: User = {
        id: 1,
        username: 'test',
        password_hash: 'hash',
        role: 'user',
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.password_hash).toBeDefined();
      expect(user.role).toBeDefined();
      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
    });

    it('should export NewUser type for inserts', () => {
      const newUser: NewUser = {
        username: 'new_user',
        password_hash: 'hash',
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(newUser.username).toBeDefined();
      // id should be optional for NewUser
      expect(newUser.id).toBeUndefined();
    });

    it('should export UserRole type', () => {
      const adminRole: UserRole = 'admin';
      const userRole: UserRole = 'user';

      expect(adminRole).toBe('admin');
      expect(userRole).toBe('user');
    });
  });

  describe('AC #5: Migration system', () => {
    it('should have idx_users_username index', () => {
      const indexes = sqlite.pragma('index_list(users)') as Array<{
        name: string;
        unique: number;
      }>;

      const usernameIndex = indexes.find((idx) => idx.name === 'idx_users_username');
      expect(usernameIndex).toBeDefined();
      expect(usernameIndex!.unique).toBe(1);
    });
  });
});

describe('Sessions Schema (Story 1.4)', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let testUserId: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema: { users, sessions } });

    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL CHECK(role IN ('admin', 'user')),
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

    // Create test user for session tests
    const now = new Date();
    const result = db
      .insert(users)
      .values({
        username: 'session_test_user',
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

  describe('AC #2: Sessions table columns (Story 1.4)', () => {
    it('should have all required columns: id, user_id, token, expires_at, created_at', () => {
      const tableInfo = sqlite.pragma('table_info(sessions)') as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('token');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('created_at');
    });

    it('should insert session with all fields populated', () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = db
        .insert(sessions)
        .values({
          user_id: testUserId,
          token: 'test_token_abc123',
          expires_at: expiresAt,
          created_at: now,
        })
        .returning()
        .get();

      expect(result).toBeDefined();
      expect(result!.id).toBeGreaterThan(0);
      expect(result!.user_id).toBe(testUserId);
      expect(result!.token).toBe('test_token_abc123');
      expect(result!.expires_at).toBeInstanceOf(Date);
      expect(result!.created_at).toBeInstanceOf(Date);
    });
  });

  describe('Session token uniqueness', () => {
    it('should reject duplicate tokens', () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const token = 'unique_token_test';

      // First insert should succeed
      db.insert(sessions)
        .values({
          user_id: testUserId,
          token,
          expires_at: expiresAt,
          created_at: now,
        })
        .run();

      // Second insert with same token should fail
      expect(() => {
        db.insert(sessions)
          .values({
            user_id: testUserId,
            token,
            expires_at: expiresAt,
            created_at: now,
          })
          .run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('Session indexes', () => {
    it('should have idx_sessions_token index for fast lookups', () => {
      const indexes = sqlite.pragma('index_list(sessions)') as Array<{
        name: string;
        unique: number;
      }>;

      const tokenIndex = indexes.find((idx) => idx.name === 'idx_sessions_token');
      expect(tokenIndex).toBeDefined();
    });

    it('should have idx_sessions_user_id index', () => {
      const indexes = sqlite.pragma('index_list(sessions)') as Array<{
        name: string;
        unique: number;
      }>;

      const userIdIndex = indexes.find((idx) => idx.name === 'idx_sessions_user_id');
      expect(userIdIndex).toBeDefined();
    });
  });

  describe('TypeScript type inference for Session', () => {
    it('should export Session type with correct shape', () => {
      const session: Session = {
        id: 1,
        user_id: 1,
        token: 'abc123',
        expires_at: new Date(),
        created_at: new Date(),
      };

      expect(session.id).toBeDefined();
      expect(session.user_id).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.expires_at).toBeDefined();
      expect(session.created_at).toBeDefined();
    });

    it('should export NewSession type for inserts', () => {
      const newSession: NewSession = {
        user_id: 1,
        token: 'new_token',
        expires_at: new Date(),
        created_at: new Date(),
      };

      expect(newSession.user_id).toBeDefined();
      expect(newSession.token).toBeDefined();
      // id should be optional for NewSession
      expect(newSession.id).toBeUndefined();
    });
  });
});
