import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    password_hash: text("password_hash").notNull(),
    // Role with CHECK constraint at column level (AC #2)
    role: text("role", { enum: ["admin", "user"] })
      .notNull()
      .default("user"),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // Unique index following architecture naming convention: idx_{table}_{columns}
    usernameIdx: uniqueIndex("idx_users_username").on(table.username),
  }),
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = "admin" | "user";

// Sessions table for Story 1.4
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tokenIdx: index("idx_sessions_token").on(table.token),
    userIdIdx: index("idx_sessions_user_id").on(table.user_id),
  }),
);

// Session types
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Books table for content management (Story 1.7 - visibility, expanded in Epic 2)
export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    author: text("author"),
    description: text("description"),
    genres: text("genres"),
    series: text("series"),
    volume: integer("volume"),
    isbn: text("isbn"),
    publication_date: text("publication_date"),
    publisher: text("publisher"),
    language: text("language"),
    file_path: text("file_path").notNull(),
    file_type: text("file_type", { enum: ["epub", "cbz", "cbr"] }).notNull(),
    content_type: text("content_type", { enum: ["book", "manga"] }).notNull(),
    cover_path: text("cover_path"),
    status: text("status", { enum: ["pending", "enriched", "quarantine"] })
      .notNull()
      .default("pending"),
    failure_reason: text("failure_reason"),
    // Visibility for content access control (AC #1, #4) - default 'public'
    visibility: text("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("public"),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    filePathIdx: uniqueIndex("idx_books_file_path").on(table.file_path),
    visibilityIdx: index("idx_books_visibility").on(table.visibility),
    titleIdx: index("idx_books_title").on(table.title),
    authorIdx: index("idx_books_author").on(table.author),
    contentTypeIdx: index("idx_books_content_type").on(table.content_type),
    statusIdx: index("idx_books_status").on(table.status),
    createdAtIdx: index("idx_books_created_at").on(table.created_at),
  }),
);

// Book types
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type Visibility = "public" | "private";
export type FileType = "epub" | "cbz" | "cbr";
export type ContentType = "book" | "manga";
export type BookStatus = "pending" | "enriched" | "quarantine";
export type BookMetadata = {
  title?: string;
  author?: string;
  description?: string;
  genres?: string[];
  series?: string;
  volume?: number;
  isbn?: string;
  publication_date?: string;
  publisher?: string;
  language?: string;
  cover_path?: string;
};
export type QuarantineInfo = {
  status: "quarantine";
  failure_reason: string;
};
