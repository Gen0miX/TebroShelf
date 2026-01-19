import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DEBUG = process.env.NODE_ENV !== 'production';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/tebroshelf.db');

if (DEBUG) {
  console.log(`[DB] Initializing database connection at: ${dbPath}`);
}

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  if (DEBUG) {
    console.log(`[DB] Created database directory: ${dbDir}`);
  }
}

// Initialize database connection with error handling
let sqlite: Database.Database;
try {
  sqlite = new Database(dbPath);
  if (DEBUG) {
    console.log('[DB] Database connection established successfully');
  }
} catch (error) {
  console.error(`[DB] Failed to connect to database at ${dbPath}:`, error);
  throw new Error(`Database connection failed: ${error}`);
}

export const db = drizzle(sqlite, { schema });
