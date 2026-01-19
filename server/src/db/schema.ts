import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  password_hash: text('password_hash').notNull(),
  // Role with CHECK constraint at column level (AC #2)
  role: text('role', { enum: ['admin', 'user'] })
    .notNull()
    .default('user')
    .$default(() => 'user' as const),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Unique index following architecture naming convention: idx_{table}_{columns}
  usernameIdx: uniqueIndex('idx_users_username').on(table.username),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = 'admin' | 'user';
