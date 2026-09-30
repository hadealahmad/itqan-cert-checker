/**
 * GitHub OAuth + eligibility.
 *
 * OAuth App setup (GitHub cannot create one via API — you must do this in the
 * browser):
 *
 *   github.com/settings/developers → OAuth Apps → New OAuth App
 *   Homepage URL:            https://<your-domain>
 *   Callback URL:            https://<your-domain>/auth/github/callback
 *
 * Then set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env. See .env.example.
 *
 * Scopes are deliberately minimal: `read:user user:email`. The eligibility
 * check needs to read the caller's own permission level on a *public* repo, and
 * GitHub returns that from a plain repo read — so no `repo` scope and no scary
 * consent screen.
 */

import type { CandidateStatus } from "./db/schema";
import type { RepoRef } from "./repo-ref";

const API = "https://api.github.com";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export const GITHUB_SCOPES = ["read:user", "user:email"];

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function clientId(): string {
  const value = process.env.GITHUB_CLIENT_ID;
  if (!value) throw new Error("GITHUB_CLIENT_ID is not set");
  return value;
}

function clientSecret(): string {
  const value = process.env.GITHUB_CLIENT_SECRET;
  if (!value) throw new Error("GITHUB_CLIENT_SECRET is not set");
  return value;
}

export function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function githubCallbackUrl(): string {
  return `${publicBaseUrl()}/auth/github/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: githubCallbackUrl(),
    scope: GITHUB_SCOPES.join(" "),
    state,
    allow_signup: "true",
  });
  return `${API}/login/oauth/authorize?${params}`;
}

/* ------------------------------------------------------------------ *
 * Token exchange
 * ------------------------------------------------------------------ */

export interface GithubProfile {
  githubId: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Trade the `?code=` for an access token. The token is never persisted. */
export async function exchangeCode(code: string): Promise<{ accessToken: string }> {
  const response = await fetch(`${API}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: githubCallbackUrl(),
    }),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? `GitHub token exchange failed (${response.status})`);
  }
  return { accessToken: data.access_token };
}

async function githubGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "itqan-cert-checker",
    },
  });
  if (response.status === 404) throw Object.assign(new Error("not found"), { status: 404 });
  if (!response.ok) {
    // Keep GitHub's own wording. A scan walks many repositories, and "422 on
    // /search/issues?q=..." tells an admin nothing — the message is what says
    // the repo was renamed, or that search will not index it.
    const detail = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw Object.assign(new Error(`GitHub ${response.status}: ${detail ?? response.statusText}`), {
      status: response.status,
    });
  }
  return (await response.json()) as T;
}

export async function fetchProfile(accessToken: string): Promise<GithubProfile> {
  const [user, emails] = await Promise.all([
    githubGet<{
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string | null;
    }>("/user", accessToken),
    githubGet<Array<{ email: string; primary: boolean; verified: boolean }>>(
      "/user/emails",
      accessToken,
    ).catch(() => []),
  ]);

  const email =
    user.email ??
    emails.find((entry) => entry.primary && entry.verified)?.email ??
    emails.find((entry) => entry.verified)?.email ??
    null;

  return {
    githubId: user.id,
    login: user.login,
    name: user.name,
    email,
    avatarUrl: user.avatar_url,
  };
}

/* ------------------------------------------------------------------ *
 * Eligibility
 * ------------------------------------------------------------------ */

export interface RepoPermissions {
  admin: boolean;
  maintain: boolean;
  push: boolean;
  triage: boolean;
  pull: boolean;
}

export interface MergedPr {
  number: number;
  title: string;
  mergedAt: string | null;
  htmlUrl: string;
}

export type DisqualifyReason = "maintainer" | "contributed" | null;

export interface Eligibility {
  eligible: boolean;
  /** Set when the person is excluded because they maintain a listed repo. */
  maintainerOf: RepoRef | null;
  /** The first listed repo with a merged PR in the window, if any. */
  contributedTo: RepoRef | null;
  /** Merged PRs found per repo, for the admin view. */
  evidence: Array<{ repo: RepoRef; mergedPrs: number; sample: MergedPr[] }>;
  /** Set when GitHub could not be reached, so the caller should not deny. */
  error?: string;
}

/** Disqualifying levels: a maintainer of a listed repo cannot claim. */
const MAINTAINER_LEVELS = ["admin", "maintain"] as const;

/**
 * The caller's own permission level on a public repo.
 *
 * GitHub returns this on a plain repo read, so read-only scope is enough.
 * We deliberately do not use /collaborators/{user}/permission, which requires
 * push access to the repository and would therefore always fail for us.
 */
export async function repoPermissions(
  repo: RepoRef,
  accessToken: string,
): Promise<RepoPermissions> {
  const data = await githubGet<{ permissions: RepoPermissions }>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,
    accessToken,
  );
  return data.permissions;
}

export async function isMaintainer(repo: RepoRef, accessToken: string): Promise<boolean> {
  try {
    const permissions = await repoPermissions(repo, accessToken);
    return MAINTAINER_LEVELS.some((level) => permissions[level]);
  } catch (error) {
    // A repo that cannot be read is not evidence of maintainership.
    if ((error as { status?: number }).status === 404) return false;
    throw error;
  }
}

/**
 * Merged PRs by `login` in `owner/repo` between two dates.
 *
 * Uses the search API rather than the commits endpoint for two reasons:
 *   - /commits only walks the default branch, so fork PRs are invisible.
 *   - /commits attributes squash-merged commits to whoever merged them.
 * Search finds fork PRs and filters server-side by merge date, in one call.
 *
 * Search is rate-limited to 30 requests/minute, so callers should stop early.
 */
export async function mergedPullRequests(
  repo: RepoRef,
  login: string,
  from: string,
  to: string,
  accessToken: string,
  perPage = 3,
): Promise<{ total: number; sample: MergedPr[] }> {
  const query = [
    "is:pr",
    "is:merged",
    `author:${login}`,
    `repo:${repo.owner}/${repo.repo}`,
    `merged:${from}..${to}`,
  ].join(" ");

  const data = await githubGet<{
    total_count: number;
    items: Array<{ number: number; title: string; pull_request?: { merged_at: string | null; html_url: string } }>;
  }>(`/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=updated&order=desc`, accessToken);

  return {
    total: data.total_count,
    sample: data.items.map((item) => ({
      number: item.number,
      title: item.title,
      mergedAt: item.pull_request?.merged_at ?? null,
      htmlUrl: item.pull_request?.html_url ?? "",
    })),
  };
}

export interface EligibilityWindow {
  repos: RepoRef[];
  contributionFrom: string;
  contributionTo: string;
}

/* ------------------------------------------------------------------ *
 * Bulk roster scan
 *
 * The admin needs to know who is eligible *before* anyone logs in, so these
 * functions invert the question: instead of "does this person qualify", they ask
 * "who qualified" and read each person's role.
 * ------------------------------------------------------------------ */

/**
 * Token used for scans, which run as the app rather than as a logged-in user.
 *
 * Scanning a *campaign* means answering "does this person maintain this repo",
 * and GitHub only answers that with push access to the repo. A participant's own
 * OAuth token cannot help — it can only report the caller's own permissions,
 * which is why the login path above reads the repo instead. So scans need a
 * separate credential that can read the organisation: `GITHUB_SCAN_TOKEN`.
 *
 * A fine-grained PAT or a GitHub App installation token both work. `scanReady`
 * checks up front so a missing or wrong token fails loudly here rather than
 * producing a quietly empty roster.
 */
export function scanToken(): string {
  const value = process.env.GITHUB_SCAN_TOKEN;
  if (!value) throw new Error("GITHUB_SCAN_TOKEN is not set");
  return value;
}

export function scanConfigured(): boolean {
  return Boolean(process.env.GITHUB_SCAN_TOKEN);
}

/**
 * How much the scan token can do on a given repo.
 *
 * "push" is the interesting one: reading whether *someone else* supervises a repo
 * needs push access to it. A read-only token can still count contributions to a
 * public repo perfectly well, but every supervisor check will come back
 * "unknown", so the roster fills with rows needing review. Worth saying out
 * loud before the scan rather than after.
 */
export async function scanAccess(
  repo: RepoRef,
  token: string,
): Promise<"push" | "read" | "none"> {
  try {
    const perms = await repoPermissions(repo, token);
    return perms.push ? "push" : "read";
  } catch {
    return "none";
  }
}

export interface ScanPreflight {
  ok: boolean;
  login: string | null;
  error?: string;
}

/** Verify the scan token works, and say what is wrong if it does not. */
export async function scanReady(token = process.env.GITHUB_SCAN_TOKEN): Promise<ScanPreflight> {
  if (!token) {
    return {
      ok: false,
      login: null,
      error: "GITHUB_SCAN_TOKEN غير مضبوط. امنح التطبيق توكناً يقرأ مستودعات المؤسسة.",
    };
  }
  try {
    const user = await githubGet<{ login: string }>("/user", token);
    return { ok: true, login: user.login };
  } catch (error) {
    return {
      ok: false,
      login: null,
      error: `تعذّر استخدام GITHUB_SCAN_TOKEN: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export interface AuthorContribution {
  login: string;
  count: number;
  sample: MergedPr | null;
}

/** Search caps out at 100 results per call, so a busy repo needs many calls. */
const SEARCH_PAGE_SIZE = 100;

/**
 * Hard cap on merged PRs read per repo, to bound both runtime and the 30
 * requests/minute search limit. A repo with more merged PRs than this is
 * reported as truncated rather than quietly under-counted.
 */
export const ROSTER_MAX_PRS_PER_REPO = 1000;

export interface RepoAuthorScan {
  repo: RepoRef;
  authors: AuthorContribution[];
  /** Merged PRs matched in total, which may exceed what was read. */
  totalMatched: number;
  /** True when the cap stopped us before reading everything. */
  truncated: boolean;
  error?: string;
}

/**
 * Every author of a merged PR in the window, without filtering by login.
 *
 * The same search as `mergedPullRequests`, but without the `author:` qualifier,
 * so one pass gives the whole contributor list instead of one query per person.
 */
export async function mergedPullRequestAuthors(
  repo: RepoRef,
  from: string,
  to: string,
  accessToken: string,
  maxPrs = ROSTER_MAX_PRS_PER_REPO,
): Promise<RepoAuthorScan> {
  const query = [
    "is:pr",
    "is:merged",
    `repo:${repo.owner}/${repo.repo}`,
    `merged:${from}..${to}`,
  ].join(" ");

  const byLogin = new Map<string, AuthorContribution>();
  let totalMatched = 0;
  let read = 0;
  let truncated = false;
  let page = 1;

  while (read < maxPrs) {
    const data = await githubGet<{
      total_count: number;
      items: Array<{
        number: number;
        title: string;
        user: { login: string; type: string } | null;
        pull_request?: { merged_at: string | null; html_url: string };
      }>;
    }>(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=${SEARCH_PAGE_SIZE}&sort=updated&order=desc&page=${page}`,
      accessToken,
    );

    totalMatched = data.total_count;
    if (data.items.length === 0) break;

    for (const item of data.items) {
      const login = item.user?.login;
      if (!login) continue; // deleted account
      // Automations are not participants. GitHub reports `type: "Bot"` for
      // accounts it knows are apps; the `[bot]` suffix catches the rest, and
      // merged dependency bumps otherwise look exactly like real contributions.
      if (item.user?.type === "Bot" || /\[bot\]$/i.test(login)) continue;
      const existing = byLogin.get(login);
      if (existing) {
        existing.count += 1;
      } else {
        byLogin.set(login, {
          login,
          count: 1,
          sample: {
            number: item.number,
            title: item.title,
            mergedAt: item.pull_request?.merged_at ?? null,
            htmlUrl: item.pull_request?.html_url ?? "",
          },
        });
      }
    }

    read += data.items.length;
    page += 1;
    if (read >= data.total_count) break;
    if (data.items.length < SEARCH_PAGE_SIZE) break;
  }

  truncated = read < totalMatched;

  const authors = [...byLogin.values()].sort((a, b) => b.count - a.count);
  return { repo, authors, totalMatched, truncated };
}

export type RoleVerdict = "admin" | "maintain" | "member" | "unknown";

/**
 * Someone's role in a repo, as seen by a token with push access.
 *
 * This is the one check the login path cannot do: a participant's own token only
 * ever reports *their own* permissions, so the reverse question needs a
 * credential with push on the repo.
 *
 * Returns "unknown" rather than throwing when GitHub refuses — which it does,
 * with 403, for any repo we do not administer. A refusal is not a clean bill of
 * health, and treating it as one would hand certificates to maintainers.
 */
export async function collaboratorRole(
  repo: RepoRef,
  login: string,
  accessToken: string,
): Promise<RoleVerdict> {
  try {
    const data = await githubGet<{ permission: string; role_name: string }>(
      `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}` +
        `/collaborators/${encodeURIComponent(login)}/permission`,
      accessToken,
    );
    const role = (data.role_name || data.permission || "").toLowerCase();
    if (role === "admin") return "admin";
    if (role === "maintain" || role === "write") return "maintain";
    return "member";
  } catch (error) {
    const status = (error as { status?: number }).status;
    // 404 = not a collaborator (a clean "not a maintainer").
    // 403 = we cannot see permissions at all. Distinct, and not a pass.
    if (status === 404) return "member";
    return "unknown";
  }
}

export interface RosterEntry {
  login: string;
  mergedPrCount: number;
  qualifiedIn: RepoRef | null;
  evidenceUrl: string | null;
  status: CandidateStatus;
  reason: string;
}

export interface RosterScan {
  entries: RosterEntry[];
  notes: string[];
}

/**
 * Build the eligible list for a campaign.
 *
 * For each listed repo, collect who merged a PR in the window; then read each
 * person's role in every listed repo and exclude maintainers. Repos are walked
 * in order and the first one that qualifies a person wins, so the evidence shown
 * to the admin is the repo we actually confirmed rather than an arbitrary one.
 */
export async function scanRoster(
  window: EligibilityWindow,
  accessToken: string,
  onProgress?: (message: string) => void,
): Promise<RosterScan> {
  const notes: string[] = [];
  const entries = new Map<string, RosterEntry>();

  for (const repo of window.repos) {
    onProgress?.(`${repo.owner}/${repo.repo}: جارٍ قراءة المساهمات…`);
    let scan: RepoAuthorScan;
    try {
      scan = await mergedPullRequestAuthors(
        repo,
        window.contributionFrom,
        window.contributionTo,
        accessToken,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`${repo.owner}/${repo.repo}: تعذّرت القراءة (${message})`);
      continue;
    }

    if (scan.truncated) {
      notes.push(
        `${repo.owner}/${repo.repo}: اكتُشفت ${scan.totalMatched} مساهمة مدمجة، وقرئت ${ROSTER_MAX_PRS_PER_REPO} فقط، فالقائمة ناقصة.`,
      );
    }
    onProgress?.(`${repo.owner}/${repo.repo}: ${scan.authors.length} مساهماً`);

    for (const author of scan.authors) {
      const key = author.login.toLowerCase();
      const existing = entries.get(key);
      const mergedPrCount = (existing?.mergedPrCount ?? 0) + author.count;
      if (existing) {
        existing.mergedPrCount = mergedPrCount;
        continue;
      }

      // Anyone holding admin or maintain on ANY listed repo is out.
      let role: RoleVerdict = "member";
      let blocker: RepoRef | null = null;
      for (const listed of window.repos) {
        const found = await collaboratorRole(listed, author.login, accessToken);
        if (found === "admin" || found === "maintain") {
          role = found;
          blocker = listed;
          break;
        }
        if (found === "unknown") role = "unknown";
      }

      const status: CandidateStatus =
        role === "admin" || role === "maintain" ? "maintainer" : role === "unknown" ? "unverified" : "eligible";
      const reason =
        status === "maintainer"
          ? `مشرف على ${blocker!.owner}/${blocker!.repo}`
          : status === "unverified"
            ? "تعذّر التحقق من صلاحية الإشراف؛ يحتاج مراجعة يدوية"
            : "مساهمة مدمجة داخل الفترة";

      entries.set(key, {
        login: author.login,
        mergedPrCount,
        qualifiedIn: status === "maintainer" ? null : repo,
        evidenceUrl: author.sample?.htmlUrl || null,
        status,
        reason,
      });
    }
  }

  return { entries: [...entries.values()], notes };
}

/**
 * Decide whether someone may claim a certificate of participation.
 *
 * Rules, as agreed:
 *   - anyone holding admin or maintain on ANY listed repo is excluded
 *   - contributing to at least one listed repo is sufficient
 *   - the contribution must be a PR merged inside the window
 *
 * Both loops short-circuit, so the worst case is two calls per repo and the
 * best case is one.
 */
export async function checkEligibility(
  login: string,
  accessToken: string,
  window: EligibilityWindow,
): Promise<Eligibility> {
  const evidence: Eligibility["evidence"] = [];

  // 1. Maintainers are excluded outright.
  for (const repo of window.repos) {
    try {
      if (await isMaintainer(repo, accessToken)) {
        return { eligible: false, maintainerOf: repo, contributedTo: null, evidence };
      }
    } catch (error) {
      return {
        eligible: false,
        maintainerOf: null,
        contributedTo: null,
        evidence,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 2. A merged PR in the window, in any listed repo, is enough.
  for (const repo of window.repos) {
    try {
      const { total, sample } = await mergedPullRequests(
        repo,
        login,
        window.contributionFrom,
        window.contributionTo,
        accessToken,
      );
      evidence.push({ repo, mergedPrs: total, sample });
      if (total > 0) {
        return { eligible: true, maintainerOf: null, contributedTo: repo, evidence };
      }
    } catch (error) {
      return {
        eligible: false,
        maintainerOf: null,
        contributedTo: null,
        evidence,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { eligible: false, maintainerOf: null, contributedTo: null, evidence };
}
