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
    throw Object.assign(new Error(`GitHub ${response.status} on ${path}`), { status: response.status });
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
