import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, like, or } from "drizzle-orm";

import { buildCode, generateSerial } from "./codes";
import { formatCode, splitCode } from "./code-format";
import { db } from "./db";
import { certificates, users, type Certificate, type User } from "./db/schema";
import { formatGregorianArabic, formatHijriArabic, toISODate } from "./dates";
import { copyFor, type Gender } from "./gender-text";
import { nameKey } from "./utils";

const PREFIX = () => process.env.CERT_PREFIX ?? "ITQ";
const CODE_YEAR = () => Number(process.env.CERT_CODE_YEAR ?? new Date().getUTCFullYear());

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export function listUsers(opts: { search?: string; limit?: number; offset?: number } = {}) {
  const { search = "", limit = 50, offset = 0 } = opts;
  const where = search
    ? or(like(users.name, `%${search}%`), like(users.email, `%${search}%`))
    : undefined;

  // A leftJoin + groupBy rather than a correlated subquery: drizzle renders
  // `sql` column references without their table qualifier, which silently
  // turns `certs.user_id = users.id` into a self-comparison.
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      notes: users.notes,
      gender: users.gender,
      createdAt: users.createdAt,
      certCount: count(certificates.id),
    })
    .from(users)
    .leftJoin(certificates, eq(certificates.userId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(asc(users.name))
    .limit(limit)
    .offset(offset)
    .all();
}

export function getUser(id: number): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function findUserByNameKey(key: string): User | undefined {
  return db.select().from(users).where(eq(users.nameKey, key)).get();
}

export function createUser(input: {
  name: string;
  gender: Gender;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}): User {
  const [created] = db
    .insert(users)
    .values({ ...input, nameKey: nameKey(input.name) })
    .returning()
    .all();
  return created!;
}

export function updateUser(
  id: number,
  input: {
    name?: string;
    gender?: Gender;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): User | undefined {
  const patch: Record<string, unknown> = { ...input, updatedAt: new Date().toISOString() };
  if (input.name) patch.nameKey = nameKey(input.name);
  return db.update(users).set(patch).where(eq(users.id, id)).returning().get();
}

export function deleteUser(id: number): void {
  // Certificates cascade with the user; re-check the caller wants that.
  db.delete(users).where(eq(users.id, id)).run();
}

/* ------------------------------------------------------------------ *
 * Certificates
 * ------------------------------------------------------------------ */

const CERT_YEAR = () => {
  const y = CODE_YEAR();
  return y >= 1000 && y <= 9999 ? y : new Date().getUTCFullYear();
};

/** Next unused 8-digit code for a year. Retries on the (rare) race. */
function allocateCode(year: number): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    const serial = generateSerial((candidate) =>
      Boolean(
        db
          .select({ id: certificates.id })
          .from(certificates)
          .where(and(eq(certificates.year, year), eq(certificates.serial, candidate)))
          .get(),
      ),
    );
    const code = buildCode(year, serial);
    const clash = db.select({ id: certificates.id }).from(certificates).where(eq(certificates.code, code)).get();
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique certificate code");
}

export function issueCertificate(input: {
  userId: number;
  issuedOn?: string;
  description?: string | null;
  year?: number;
}): Certificate {
  const user = getUser(input.userId);
  if (!user) throw new Error("User not found");

  const year = input.year ?? CERT_YEAR();
  const issuedOn = input.issuedOn ?? toISODate(new Date());

  return db.transaction((tx) => {
    const code = allocateCode(year);
    const { serial } = splitCode(code);
    const [created] = tx
      .insert(certificates)
      .values({
        userId: user.id,
        code,
        year,
        serial,
        issuedOn,
        recipientName: user.name,
        description: input.description ?? null,
        printToken: randomBytes(16).toString("base64url"),
      })
      .returning()
      .all();
    return created!;
  });
}

export function getCertificateById(id: number): Certificate | undefined {
  return db.select().from(certificates).where(eq(certificates.id, id)).get();
}

export function getCertificateByCode(code: string): Certificate | undefined {
  return db.select().from(certificates).where(eq(certificates.code, code)).get();
}

export function getCertificateByPrintToken(token: string): Certificate | undefined {
  return db.select().from(certificates).where(eq(certificates.printToken, token)).get();
}

export function listCertificates(opts: {
  search?: string;
  status?: "issued" | "revoked" | "all";
  limit?: number;
  offset?: number;
} = {}) {
  const { search = "", status = "all", limit = 50, offset = 0 } = opts;

  const clauses = [];
  if (search) {
    clauses.push(
      or(
        like(certificates.recipientName, `%${search}%`),
        like(certificates.code, `%${search.replace(/[^0-9]/g, "")}%`),
      ),
    );
  }
  if (status !== "all") clauses.push(eq(certificates.status, status));

  return db
    .select({
      id: certificates.id,
      code: certificates.code,
      year: certificates.year,
      serial: certificates.serial,
      status: certificates.status,
      issuedOn: certificates.issuedOn,
      recipientName: certificates.recipientName,
      userId: certificates.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(certificates)
    .leftJoin(users, eq(certificates.userId, users.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(certificates.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function setCertStatus(
  id: number,
  status: "issued" | "revoked",
  reason?: string | null,
): Certificate | undefined {
  return db
    .update(certificates)
    .set({
      status,
      revokedAt: status === "revoked" ? new Date().toISOString() : null,
      revokeReason: status === "revoked" ? (reason ?? null) : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(certificates.id, id))
    .returning()
    .get();
}

export function deleteCertificate(id: number): void {
  db.delete(certificates).where(eq(certificates.id, id)).run();
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/**
 * Everything the certificate component needs, derived from a DB row.
 *
 * A per-certificate `description` override wins over the gendered default, so
 * an operator can still hand-write a paragraph for one recipient.
 */
export function certificateValues(
  cert: Certificate,
  recipientGender: Gender = "male",
) {
  const copy = copyFor(recipientGender);
  return {
    recipientName: cert.recipientName,
    certNumber: formatCode(cert.code, PREFIX()),
    gregorianDate: formatGregorianArabic(cert.issuedOn),
    hijriDate: formatHijriArabic(cert.issuedOn),
    contributed: copy.contributed,
    description: cert.description ?? copy.description,
  };
}

/** Certificates whose rendered files must be rebuilt when this user changes. */
export function certificatesForUser(userId: number): Certificate[] {
  return db.select().from(certificates).where(eq(certificates.userId, userId)).all();
}

export function stats() {
  const [userCount] = db.select({ value: count() }).from(users).all();
  const [certCount] = db.select({ value: count() }).from(certificates).all();
  const [revokedCount] = db
    .select({ value: count() })
    .from(certificates)
    .where(eq(certificates.status, "revoked"))
    .all();
  return {
    users: userCount?.value ?? 0,
    certificates: certCount?.value ?? 0,
    revoked: revokedCount?.value ?? 0,
  };
}
