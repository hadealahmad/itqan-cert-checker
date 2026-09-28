import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, isNotNull, like, or } from "drizzle-orm";

import { buildCode, generateSerial } from "./codes";
import { formatCode, splitCode } from "./code-format";
import { db } from "./db";
import {
  certificates,
  programs,
  templates,
  users,
  type CertSource,
  type Certificate,
  type User,
} from "./db/schema";
import { formatGregorianArabic, formatHijriArabic, toISODate } from "./dates";
import { copyFor, type Gender } from "./gender-text";
import { defaultTemplate, getProgram } from "./programs";
import { nameKey } from "./utils";

const PREFIX = () => process.env.CERT_PREFIX ?? "ITQ";
const CODE_YEAR = () => {
  const y = Number(process.env.CERT_CODE_YEAR ?? new Date().getUTCFullYear());
  return y >= 1000 && y <= 9999 ? y : new Date().getUTCFullYear();
};

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export function listUsers(opts: { search?: string; limit?: number; offset?: number } = {}) {
  const { search = "", limit = 50, offset = 0 } = opts;
  const where = search
    ? or(like(users.name, `%${search}%`), like(users.email, `%${search}%`), like(users.githubLogin, `%${search}%`))
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
      githubId: users.githubId,
      githubLogin: users.githubLogin,
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

export function getUserByGithubId(githubId: number): User | undefined {
  return db.select().from(users).where(eq(users.githubId, githubId)).get();
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
  db.delete(users).where(eq(users.id, id)).run();
}

/* ------------------------------------------------------------------ *
 * GitHub-linked participants
 * ------------------------------------------------------------------ */

/** Links a GitHub identity to a user, creating the row on first sight. */
export function upsertGithubUser(profile: {
  githubId: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}): User {
  const existing = getUserByGithubId(profile.githubId);
  const name = (profile.name ?? "").trim() || profile.login;

  if (existing) {
    // Refresh the mutable profile bits; never touch name or gender, which the
    // participant owns once set.
    return (
      db
        .update(users)
        .set({ githubLogin: profile.login, githubAvatar: profile.avatarUrl, updatedAt: new Date().toISOString() })
        .where(eq(users.id, existing.id))
        .returning()
        .get() ?? existing
    );
  }

  // Prefer merging into a manually-created user with the same name so an
  // admin-issued certificate still counts against a self-claim.
  const byName = findUserByNameKey(nameKey(name));
  if (byName) {
    return (
      db
        .update(users)
        .set({
          githubId: profile.githubId,
          githubLogin: profile.login,
          githubAvatar: profile.avatarUrl,
          email: byName.email ?? profile.email,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, byName.id))
        .returning()
        .get() ?? byName
    );
  }

  const [created] = db
    .insert(users)
    .values({
      name,
      nameKey: nameKey(name),
      gender: "male",
      email: profile.email,
      githubId: profile.githubId,
      githubLogin: profile.login,
      githubAvatar: profile.avatarUrl,
    })
    .returning()
    .all();
  return created!;
}

export function recordEligibility(userId: number, eligible: boolean): void {
  db.update(users)
    .set({
      lastEligible: eligible ? 1 : 0,
      eligibilityCheckedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();
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

export class DuplicateCertificateError extends Error {
  constructor(
    readonly certificateId: number,
    readonly code: string,
  ) {
    super("This person already has a certificate for this template");
    this.name = "DuplicateCertificateError";
  }
}

/** The person's existing certificate for a template, if any. */
export function findCertificateForTemplate(userId: number, templateId: number): Certificate | undefined {
  return db
    .select()
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.templateId, templateId)))
    .get();
}

export function issueCertificate(input: {
  userId: number;
  templateId?: number;
  programId?: number | null;
  source?: CertSource;
  issuedOn?: string;
  description?: string | null;
  year?: number;
}): Certificate {
  const user = getUser(input.userId);
  if (!user) throw new Error("User not found");

  const templateId = input.templateId ?? defaultTemplate().id;
  const year = input.year ?? CERT_YEAR();
  const issuedOn = input.issuedOn ?? toISODate(new Date());
  const source: CertSource = input.source ?? "admin";

  return db.transaction((tx) => {
    // One certificate per person per template, whoever issues it. An
    // admin-issued certificate therefore blocks a later self-claim.
    const existing = tx
      .select()
      .from(certificates)
      .where(and(eq(certificates.userId, user.id), eq(certificates.templateId, templateId)))
      .get();
    if (existing) throw new DuplicateCertificateError(existing.id, existing.code);

    const code = allocateCode(year);
    const { serial } = splitCode(code);
    const [created] = tx
      .insert(certificates)
      .values({
        userId: user.id,
        templateId,
        programId: input.programId ?? null,
        source,
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

/** Certificates belonging to one person, newest first. */
export function listCertificatesForUser(userId: number) {
  return db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.id))
    .all();
}

export function listCertificates(opts: {
  search?: string;
  status?: "issued" | "revoked" | "all";
  programId?: number;
  limit?: number;
  offset?: number;
} = {}) {
  const { search = "", status = "all", programId, limit = 50, offset = 0 } = opts;

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
  if (programId) clauses.push(eq(certificates.programId, programId));

  return db
    .select({
      id: certificates.id,
      code: certificates.code,
      year: certificates.year,
      serial: certificates.serial,
      status: certificates.status,
      source: certificates.source,
      issuedOn: certificates.issuedOn,
      recipientName: certificates.recipientName,
      templateId: certificates.templateId,
      templateName: templates.nameAr,
      programId: certificates.programId,
      userId: certificates.userId,
      userName: users.name,
      userEmail: users.email,
      githubLogin: users.githubLogin,
    })
    .from(certificates)
    .innerJoin(templates, eq(certificates.templateId, templates.id))
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

/**
 * A participant editing their own certificate. Updates the user's name and
 * gender, re-snapshots the recipient name on the certificate, and drops the
 * rendered file so the next download reflects the change.
 */
export function updateCertificateDetails(
  certificateId: number,
  input: { name: string; gender: Gender },
): Certificate | undefined {
  const cert = getCertificateById(certificateId);
  if (!cert) return undefined;
  updateUser(cert.userId, { name: input.name, gender: input.gender });
  return db
    .update(certificates)
    .set({ recipientName: input.name, updatedAt: new Date().toISOString() })
    .where(eq(certificates.id, certificateId))
    .returning()
    .get();
}

export function deleteCertificate(id: number): void {
  db.delete(certificates).where(eq(certificates.id, id)).run();
}

/** Certificates whose rendered files must be rebuilt when this user changes. */
export function certificatesForUser(userId: number): Certificate[] {
  return db.select().from(certificates).where(eq(certificates.userId, userId)).all();
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/** Everything the certificate component needs, derived from a DB row. */
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

export function stats() {
  const [userCount] = db.select({ value: count() }).from(users).all();
  const [certCount] = db.select({ value: count() }).from(certificates).all();
  const [revokedCount] = db
    .select({ value: count() })
    .from(certificates)
    .where(eq(certificates.status, "revoked"))
    .all();
  const [selfIssued] = db
    .select({ value: count() })
    .from(certificates)
    .where(eq(certificates.source, "self"))
    .all();
  const [programCount] = db.select({ value: count() }).from(programs).all();
  const [githubCount] = db
    .select({ value: count() })
    .from(users)
    .where(isNotNull(users.githubId))
    .all();

  return {
    users: userCount?.value ?? 0,
    certificates: certCount?.value ?? 0,
    revoked: revokedCount?.value ?? 0,
    selfIssued: selfIssued?.value ?? 0,
    programs: programCount?.value ?? 0,
    githubUsers: githubCount?.value ?? 0,
  };
}

export { getProgram };
