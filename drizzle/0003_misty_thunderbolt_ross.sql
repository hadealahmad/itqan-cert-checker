CREATE TABLE `program_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_repos_unique_idx` ON `program_repos` (`program_id`,`owner`,`repo`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`name_ar` text NOT NULL,
	`contribution_from` text NOT NULL,
	`contribution_to` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `programs_active_idx` ON `programs` (`is_active`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_slug_idx` ON `templates` (`slug`);--> statement-breakpoint
DROP INDEX `certificates_user_idx`;--> statement-breakpoint
ALTER TABLE `certificates` ADD `template_id` integer NOT NULL REFERENCES templates(id);--> statement-breakpoint
ALTER TABLE `certificates` ADD `program_id` integer REFERENCES programs(id);--> statement-breakpoint
ALTER TABLE `certificates` ADD `source` text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_user_template_idx` ON `certificates` (`user_id`,`template_id`);--> statement-breakpoint
CREATE INDEX `certificates_program_idx` ON `certificates` (`program_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `github_id` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `github_login` text;--> statement-breakpoint
ALTER TABLE `users` ADD `github_avatar` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_eligible` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `eligibility_checked_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_idx` ON `users` (`github_id`);