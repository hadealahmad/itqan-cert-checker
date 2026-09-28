import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { GENDERS } from "@/lib/gender-text";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

type Gender = (typeof GENDERS)[number];

/**
 * A certificate design. The artwork and geometry live in code, keyed by
 * `slug` (see src/lib/cert-template.ts); this table is the catalogue an admin
 * picks from when creating a program.
 */
export const templates = sqliteTable(
  "templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Key into the renderer registry. */
    slug: text("slug").notNull(),
    nameAr: text("name_ar").notNull(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("templates_slug_idx").on(t.slug)],
);

/**
 * A campaign: which template, which window counts as participation, and which
 * repositories count. An admin creates these; a GitHub participant is matched
 * against them on login.
 */
export const programs = sqliteTable(
  "programs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    nameAr: text("name_ar").notNull(),
    /** Inclusive contribution window. A merged PR must be dated within it. */
    contributionFrom: text("contribution_from").notNull(),
    contributionTo: text("contribution_to").notNull(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("programs_active_idx").on(t.isActive)],
);

/** Repositories whose contributions count for a program. */
export const programRepos = sqliteTable(
  "program_repos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
  },
  (t) => [uniqueIndex("program_repos_unique_idx").on(t.programId, t.owner, t.repo)],
);

/**
 * A person who can receive certificates. Kept separate from certificates so the
 * same person can hold several — but never two of the same template.
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /** Drives the gendered wording on the certificate. */
    gender: text("gender").$type<Gender>().notNull().default("male"),
    /** Normalised "first last", used to warn about likely duplicates. */
    nameKey: text("name_key").notNull(),

    /** Set when the person arrived through GitHub OAuth. */
    githubId: integer("github_id"),
    githubLogin: text("github_login"),
    githubAvatar: text("github_avatar"),
    /** Verdict of the most recent eligibility check, and when it ran. */
    lastEligible: integer("last_eligible"),
    eligibilityCheckedAt: text("eligibility_checked_at"),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    index("users_name_key_idx").on(t.nameKey),
    index("users_gender_idx").on(t.gender),
    uniqueIndex("users_github_id_idx").on(t.githubId),
  ],
);

export const CERT_STATUSES = ["issued", "revoked"] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

/** Who issued it. Manual admin issuance stays available alongside self-claim. */
export const CERT_SOURCES = ["admin", "self"] as const;
export type CertSource = (typeof CERT_SOURCES)[number];

export const certificates = sqliteTable(
  "certificates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Which design. One per user per template, enforced below. */
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    /** Null for certificates issued manually outside any campaign. */
    programId: integer("program_id").references(() => programs.id, { onDelete: "set null" }),
    source: text("source").$type<CertSource>().notNull().default("admin"),

    /** 8 digits: YYYY + 4-digit random serial. Unique forever, never reused. */
    code: text("code").notNull(),
    /** Denormalised from `code` for cheap per-year uniqueness checks. */
    year: integer("year").notNull(),
    serial: text("serial").notNull(),

    status: text("status").$type<CertStatus>().notNull().default("issued"),
    /** ISO date (YYYY-MM-DD) the certificate was issued. */
    issuedOn: text("issued_on").notNull(),
    /** Snapshot of the recipient's name at issue time. */
    recipientName: text("recipient_name").notNull(),
    /** Optional per-certificate override of the body paragraph. */
    description: text("description"),

    revokedAt: text("revoked_at"),
    revokeReason: text("revoke_reason"),

    /**
     * Unguessable id for the public /p/[token] view and its download route.
     * Certificates are rendered lazily on first download, so there is no
     * render-status column: the filesystem is the only record of what exists.
     */
    printToken: text("print_token").notNull(),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("certificates_code_idx").on(t.code),
    uniqueIndex("certificates_year_serial_idx").on(t.year, t.serial),
    uniqueIndex("certificates_print_token_idx").on(t.printToken),
    // One certificate per person per template, whoever issued it.
    uniqueIndex("certificates_user_template_idx").on(t.userId, t.templateId),
    index("certificates_program_idx").on(t.programId),
    index("certificates_status_idx").on(t.status),
  ],
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Program = typeof programs.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
