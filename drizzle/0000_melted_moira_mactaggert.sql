CREATE TABLE `certificates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`serial` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_on` text NOT NULL,
	`recipient_name` text NOT NULL,
	`description` text,
	`revoked_at` text,
	`revoke_reason` text,
	`render_status` text DEFAULT 'pending' NOT NULL,
	`render_error` text,
	`rendered_at` text,
	`print_token` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_code_idx` ON `certificates` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_year_serial_idx` ON `certificates` (`year`,`serial`);--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_print_token_idx` ON `certificates` (`print_token`);--> statement-breakpoint
CREATE INDEX `certificates_user_idx` ON `certificates` (`user_id`);--> statement-breakpoint
CREATE INDEX `certificates_status_idx` ON `certificates` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`name_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_name_key_idx` ON `users` (`name_key`);--> statement-breakpoint
CREATE TABLE `verification_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`ip_hash` text NOT NULL,
	`outcome` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_attempts_ip_created_idx` ON `verification_attempts` (`ip_hash`,`created_at`);