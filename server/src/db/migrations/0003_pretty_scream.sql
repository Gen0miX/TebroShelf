ALTER TABLE `books` ADD `description` text;--> statement-breakpoint
ALTER TABLE `books` ADD `genres` text;--> statement-breakpoint
ALTER TABLE `books` ADD `series` text;--> statement-breakpoint
ALTER TABLE `books` ADD `volume` integer;--> statement-breakpoint
ALTER TABLE `books` ADD `isbn` text;--> statement-breakpoint
ALTER TABLE `books` ADD `publication_date` text;--> statement-breakpoint
ALTER TABLE `books` ADD `failure_reason` text;--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`);--> statement-breakpoint
CREATE INDEX `idx_books_author` ON `books` (`author`);--> statement-breakpoint
CREATE INDEX `idx_books_content_type` ON `books` (`content_type`);--> statement-breakpoint
CREATE INDEX `idx_books_status` ON `books` (`status`);--> statement-breakpoint
CREATE INDEX `idx_books_created_at` ON `books` (`created_at`);