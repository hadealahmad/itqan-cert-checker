import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "./db";
import { programRepos, programs, templates, type Template } from "./db/schema";
import { REGISTERED_SLUGS } from "./templates";
import type { ProgramWithRepos, RepoRef } from "./repo-ref";

export type { ProgramWithRepos, RepoRef };
export { parseRepoLines } from "./repo-ref";

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

/** The catalogue an admin chooses from. Rows must map to a registered renderer. */
export function listTemplates(): Template[] {
  return db.select().from(templates).orderBy(asc(templates.nameAr)).all();
}

export function getTemplateById(id: number): Template | undefined {
  return db.select().from(templates).where(eq(templates.id, id)).get();
}

export function getTemplateBySlug(slug: string): Template | undefined {
  return db.select().from(templates).where(eq(templates.slug, slug)).get();
}

/**
 * Creates the catalogue rows for every registered renderer.
 *
 * Idempotent: safe to call on every boot or after adding a new design. A row is
 * only inserted if the slug has no row yet, and a row whose slug is no longer
 * registered is left alone rather than deleted (certificates may reference it).
 */
export function syncTemplateCatalogue(): Template[] {
  const existing = listTemplates();
  for (const slug of REGISTERED_SLUGS) {
    if (existing.some((row) => row.slug === slug)) continue;
    const def = REGISTERED_LABELS[slug] ?? slug;
    db.insert(templates).values({ slug, nameAr: def }).run();
  }
  return listTemplates();
}

const REGISTERED_LABELS: Record<string, string> = {
  "code-quran": "كود يخدم القرآن",
};

/** The template used when a caller does not name one. */
export function defaultTemplate(): Template {
  const first = db.select().from(templates).orderBy(asc(templates.id)).get();
  if (!first) throw new Error("No templates in the catalogue — run syncTemplateCatalogue()");
  return first;
}

/* ------------------------------------------------------------------ *
 * Programs
 * ------------------------------------------------------------------ */

function reposFor(programIds: number[]): Map<number, RepoRef[]> {
  const map = new Map<number, RepoRef[]>();
  if (programIds.length === 0) return map;
  const rows = db
    .select()
    .from(programRepos)
    .where(inArray(programRepos.programId, programIds))
    .orderBy(asc(programRepos.owner), asc(programRepos.repo))
    .all();
  for (const row of rows) {
    const list = map.get(row.programId) ?? [];
    list.push({ owner: row.owner, repo: row.repo });
    map.set(row.programId, list);
  }
  return map;
}

export function listPrograms(opts: { onlyActive?: boolean } = {}): ProgramWithRepos[] {
  const rows = db
    .select({
      id: programs.id,
      nameAr: programs.nameAr,
      templateId: programs.templateId,
      templateSlug: templates.slug,
      templateName: templates.nameAr,
      contributionFrom: programs.contributionFrom,
      contributionTo: programs.contributionTo,
      isActive: programs.isActive,
      createdAt: programs.createdAt,
    })
    .from(programs)
    .innerJoin(templates, eq(programs.templateId, templates.id))
    .orderBy(desc(programs.id))
    .all();

  // drizzle types the integer boolean column as `number`; the interface wants a
  // real boolean, so normalise once here rather than at every call site.
  const typed = rows.map((row) => ({ ...row, isActive: row.isActive === 1 })) as ProgramWithRepos[];
  const withRepos = reposFor(typed.map((row) => row.id));
  return typed
    .filter((row) => (opts.onlyActive ? row.isActive : true))
    .map((row) => ({ ...row, repos: withRepos.get(row.id) ?? [], certCount: 0 }));
}

export function getProgram(id: number): ProgramWithRepos | undefined {
  return listPrograms().find((row) => row.id === id);
}

/** Active programs a participant could currently qualify for. */
export function activePrograms(): ProgramWithRepos[] {
  return listPrograms({ onlyActive: true });
}

export function createProgram(input: {
  nameAr: string;
  templateId: number;
  contributionFrom: string;
  contributionTo: string;
  repos: RepoRef[];
  isActive?: boolean;
}): ProgramWithRepos {
  return db.transaction((tx) => {
    const [created] = tx
      .insert(programs)
      .values({
        nameAr: input.nameAr,
        templateId: input.templateId,
        contributionFrom: input.contributionFrom,
        contributionTo: input.contributionTo,
        isActive: (input.isActive ?? true) ? 1 : 0,
      })
      .returning()
      .all();
    if (input.repos.length > 0) {
      tx.insert(programRepos)
        .values(input.repos.map((repo) => ({ programId: created!.id, ...repo })))
        .run();
    }
    return getProgram(created!.id)!;
  });
}

export function updateProgram(
  id: number,
  input: {
    nameAr: string;
    templateId: number;
    contributionFrom: string;
    contributionTo: string;
    repos: RepoRef[];
    isActive: boolean;
  },
): ProgramWithRepos | undefined {
  return db.transaction((tx) => {
    tx.update(programs)
      .set({
        nameAr: input.nameAr,
        templateId: input.templateId,
        contributionFrom: input.contributionFrom,
        contributionTo: input.contributionTo,
        isActive: input.isActive ? 1 : 0,
      })
      .where(eq(programs.id, id))
      .run();

    // Replace the repo set wholesale — simpler and always correct.
    tx.delete(programRepos).where(eq(programRepos.programId, id)).run();
    if (input.repos.length > 0) {
      tx.insert(programRepos)
        .values(input.repos.map((repo) => ({ programId: id, ...repo })))
        .run();
    }
    return getProgram(id);
  });
}

export function deleteProgram(id: number): void {
  db.delete(programs).where(eq(programs.id, id)).run();
}
