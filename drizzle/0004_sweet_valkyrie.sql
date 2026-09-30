CREATE TABLE `program_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`github_id` integer,
	`avatar_url` text,
	`profile_url` text,
	`status` text DEFAULT 'unverified' NOT NULL,
	`reason` text,
	`merged_pr_count` integer DEFAULT 0 NOT NULL,
	`qualified_in` text,
	`evidence_url` text,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`checked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`claimed_at` text,
	`certificate_id` integer,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_candidates_unique_idx` ON `program_candidates` (`program_id`,`github_login`);--> statement-breakpoint
CREATE INDEX `program_candidates_status_idx` ON `program_candidates` (`program_id`,`status`);