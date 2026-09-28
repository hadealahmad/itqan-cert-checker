import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { GENDERS } from "@/lib/gender-text";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

type Gender = (typeof GENDERS)[number];

/**
 * A person who can receive certificates. Kept separate from certificates so the
 * same person can hold several (different years, different campaigns) without
 * duplicating their details.
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
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("users_name_key_idx").on(t.nameKey), index("users_gender_idx").on(t.gender)],
);

export const CERT_STATUSES = ["issued", "revoked"] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export const certificates = sqliteTable(
  "certificates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

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
    index("certificates_user_idx").on(t.userId),
    index("certificates_status_idx").on(t.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
