/**
 * The campaign roster: who a scan says is eligible, and how far each person has
 * got towards actually holding a certificate.
 *
 * A re-scan upserts what it finds and never deletes. That matters because a
 * claimed row is linked to a real certificate — dropping it would orphan the
 * link and make the progress tracker disagree with the certificates table.
 * People the new scan no longer sees keep their last known status.
 */

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./db";
import { programCandidates, type CandidateStatus } from "./db/schema";
import type { RosterEntry } from "./github";

export interface CandidateRow {
  id: number;
  programId: number;
  githubLogin: string;
  githubId: number | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  status: CandidateStatus;
  /** Set once an admin has ruled on this row; the scan then leaves it alone. */
  isManual: number;
  reason: string | null;
  mergedPrCount: number;
  qualifiedIn: string | null;
  evidenceUrl: string | null;
  firstSeenAt: string;
  checkedAt: string;
  claimedAt: string | null;
  certificateId: number | null;
}

export interface RosterSummary {
  total: number;
  eligible: number;
  unverified: number;
  maintainer: number;
  claimed: number;
  excluded: number;
}

export function listCandidates(programId: number): CandidateRow[] {
  return db
    .select()
    .from(programCandidates)
    .where(eq(programCandidates.programId, programId))
    .orderBy(
      // Claimed first, then the people waiting on a decision, then the rest.
      sql`case ${programCandidates.status}
            when 'unverified' then 0
            when 'eligible' then 1
            when 'claimed' then 2
            when 'maintainer' then 3
            else 4
          end`,
      desc(programCandidates.mergedPrCount),
      asc(programCandidates.githubLogin),
    )
    .all();
}

export function rosterSummary(programId: number): RosterSummary {
  const rows = db
    .select({ status: programCandidates.status, total: count() })
    .from(programCandidates)
    .where(eq(programCandidates.programId, programId))
    .groupBy(programCandidates.status)
    .all();

  const summary: RosterSummary = {
    total: 0,
    eligible: 0,
    unverified: 0,
    maintainer: 0,
    claimed: 0,
    excluded: 0,
  };
  for (const row of rows) {
    summary.total += row.total;
    if (row.status in summary) summary[row.status] += row.total;
  }
  return summary;
}

function profileUrlFor(login: string): string {
  return `https://github.com/${login}`;
}

/**
 * Fold a fresh scan into the stored roster.
 *
 * Claimed and admin-excluded rows are left exactly as they are: a re-scan has
 * no business undoing a decision a human made.
 */
export function upsertRoster(programId: number, entries: RosterEntry[]): RosterSummary {
  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    for (const entry of entries) {
      const loginKey = entry.login.toLowerCase();
      const existing = tx
        .select()
        .from(programCandidates)
        .where(
          and(
            eq(programCandidates.programId, programId),
            eq(programCandidates.githubLogin, loginKey),
          ),
        )
        .get();

      if (!existing) {
        tx.insert(programCandidates)
          .values({
            programId,
            githubLogin: loginKey,
            avatarUrl: null,
            profileUrl: profileUrlFor(entry.login),
            status: entry.status,
            reason: entry.reason,
            mergedPrCount: entry.mergedPrCount,
            qualifiedIn: entry.qualifiedIn
              ? `${entry.qualifiedIn.owner}/${entry.qualifiedIn.repo}`
              : null,
            evidenceUrl: entry.evidenceUrl,
            checkedAt: nowIso,
          })
          .run();
        continue;
      }

      // Keep the count fresh, but never overwrite a human decision. This covers
      // both an admin's manual ruling and a row that already produced a
      // certificate; a scan has no business undoing either.
      if (existing.isManual === 1 || existing.status === "claimed" || existing.status === "excluded") {
        tx.update(programCandidates)
          .set({ mergedPrCount: entry.mergedPrCount, checkedAt: nowIso })
          .where(eq(programCandidates.id, existing.id))
          .run();
        continue;
      }

      tx.update(programCandidates)
        .set({
          status: entry.status,
          reason: entry.reason,
          mergedPrCount: entry.mergedPrCount,
          qualifiedIn: entry.qualifiedIn
            ? `${entry.qualifiedIn.owner}/${entry.qualifiedIn.repo}`
            : null,
          evidenceUrl: entry.evidenceUrl,
          avatarUrl: existing.avatarUrl ?? null,
          checkedAt: nowIso,
        })
        .where(eq(programCandidates.id, existing.id))
        .run();
    }
  });

  return rosterSummary(programId);
}

export function getCandidate(id: number): CandidateRow | undefined {
  return db.select().from(programCandidates).where(eq(programCandidates.id, id)).get();
}

export function findCandidate(programId: number, login: string): CandidateRow | undefined {
  return db
    .select()
    .from(programCandidates)
    .where(
      and(
        eq(programCandidates.programId, programId),
        eq(programCandidates.githubLogin, login.toLowerCase()),
      ),
    )
    .get();
}

/** Find a person's row in any campaign, for the login path. */
export function findCandidateAnywhere(login: string): CandidateRow | undefined {
  return db
    .select()
    .from(programCandidates)
    .where(eq(programCandidates.githubLogin, login.toLowerCase()))
    .orderBy(desc(programCandidates.checkedAt))
    .get();
}

export function setCandidateStatus(
  id: number,
  status: CandidateStatus,
  reason: string,
  opts: { manual?: boolean } = {},
): CandidateRow | undefined {
  db.update(programCandidates)
    .set({
      status,
      reason,
      // A manual ruling is protected from later scans; an explicit re-check
      // passes manual: false, because a fresh reading should win.
      isManual: opts.manual === false ? 0 : 1,
      checkedAt: new Date().toISOString(),
    })
    .where(eq(programCandidates.id, id))
    .run();
  return db.select().from(programCandidates).where(eq(programCandidates.id, id)).get();
}

export function deleteCandidate(id: number): void {
  db.delete(programCandidates).where(eq(programCandidates.id, id)).run();
}

export function clearRoster(programId: number): number {
  // Claimed rows stay: their certificates still exist and still show a link.
  const result = db
    .delete(programCandidates)
    .where(
      and(
        eq(programCandidates.programId, programId),
        inArray(programCandidates.status, ["eligible", "unverified", "maintainer"]),
      ),
    )
    .run();
  return result.changes;
}

/** Link a roster row to the certificate its holder just claimed. */
export function markCandidateClaimed(
  programId: number,
  login: string,
  certificateId: number,
): void {
  db.update(programCandidates)
    .set({
      status: "claimed",
      reason: "استلم الشهادة",
      claimedAt: new Date().toISOString(),
      certificateId,
      checkedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(programCandidates.programId, programId),
        eq(programCandidates.githubLogin, login.toLowerCase()),
      ),
    )
    .run();
}

/**
 * Fill in identity details the scan could not know — a scan sees logins, not
 * avatars or numeric ids, and only the person's own login supplies those.
 */
export function attachGithubIdentity(
  programId: number,
  login: string,
  githubId: number,
  avatarUrl: string | null,
): void {
  db.update(programCandidates)
    .set({ githubId, avatarUrl })
    .where(
      and(
        eq(programCandidates.programId, programId),
        eq(programCandidates.githubLogin, login.toLowerCase()),
      ),
    )
    .run();
}
