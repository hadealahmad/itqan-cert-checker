/**
 * Pure helpers for repository references.
 *
 * No database and no Node built-ins, so client components can import these
 * (the programs admin form parses and previews repo input as you type).
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface ProgramWithRepos {
  id: number;
  nameAr: string;
  templateId: number;
  templateSlug: string;
  templateName: string;
  contributionFrom: string;
  contributionTo: string;
  isActive: boolean;
  repos: RepoRef[];
  certCount: number;
  createdAt: string;
}

/**
 * Parse "owner/repo" input from an admin.
 *
 * Accepts one per line or space/comma separated, tolerates pasted GitHub URLs
 * and a trailing ".git", and drops blanks, malformed lines and duplicates.
 */
export function parseRepoLines(input: string): RepoRef[] {
  const seen = new Set<string>();
  const out: RepoRef[] = [];

  for (const raw of input.split(/[\s,]+/)) {
    const line = raw
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");

    const parts = line.split("/").filter(Boolean);
    if (parts.length !== 2) continue;

    const [owner, repo] = parts as [string, string];
    if (!owner || !repo) continue;

    const key = `${owner}/${repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ owner, repo });
  }

  return out;
}

export function formatRepo(repo: RepoRef): string {
  return `${repo.owner}/${repo.repo}`;
}
