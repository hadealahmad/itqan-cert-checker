DROP TABLE `verification_attempts`;--> statement-breakpoint
CREATE INDEX `users_gender_idx` ON `users` (`gender`);--> statement-breakpoint
ALTER TABLE `certificates` DROP COLUMN `render_status`;--> statement-breakpoint
ALTER TABLE `certificates` DROP COLUMN `render_error`;--> statement-breakpoint
ALTER TABLE `certificates` DROP COLUMN `rendered_at`;