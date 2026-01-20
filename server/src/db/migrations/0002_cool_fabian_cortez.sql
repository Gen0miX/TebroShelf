CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`file_path` text NOT NULL,
	`file_type` text NOT NULL,
	`content_type` text NOT NULL,
	`cover_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL CHECK(visibility IN ('public', 'private')),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_books_file_path` ON `books` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_books_visibility` ON `books` (`visibility`);