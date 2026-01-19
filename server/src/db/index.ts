import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Standardize database path resolution to match drizzle.config.ts
// Use relative path from project root, not process.cwd()
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/tebroshelf.db');

console.log(`Initializing database connection at: ${dbPath}`);

// Ensure database directory exists
try {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}`);
  }
} catch (error) {
  console.error(`Failed to create database directory: ${error}`);
  throw new Error(`Database directory creation failed: ${error}`);
}

// Initialize database connection with error handling
let sqlite: Database.Database;
try {
  sqlite = new Database(dbPath);
  console.log('Database connection established successfully');
} catch (error) {
  console.error(`Failed to connect to database at ${dbPath}:`, error);
  throw new Error(`Database connection failed: ${error}`);
}

export const db = drizzle(sqlite, { schema });
