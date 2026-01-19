import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/tebroshelf.db');

console.log(`Running migrations on database: ${dbPath}`);

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created database directory: ${dbDir}`);
}

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

try {
  migrate(db, { migrationsFolder: path.join(__dirname, '../db/migrations') });
  console.log('✅ Migrations applied successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

sqlite.close();
