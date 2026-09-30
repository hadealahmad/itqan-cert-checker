import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GITHUB_STATE_COOKIE } from "@/lib/auth";
import { setParticipantSession } from "@/lib/session";
import { recordEligibility, upsertGithubUser } from "@/lib/certs";
import { activePrograms } from "@/lib/programs";
import { checkEligibility, exchangeCode, fetchProfile } from "@/lib/github";
import { attachGithubIdentity, findCandidate } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * GitHub OAuth callback.
 *
 * Runs the eligibility check with the freshly issued token, links (or creates)
 * the user row, records the verdict, and sends them to their certificate page.
 * The access token is never stored.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();

  const expectedState = store.get(GITHUB_STATE_COOKIE)?.value;
  store.delete(GITHUB_STATE_COOKIE);

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?github=${encodeURIComponent(reason)}`, url.origin));

  if (!code) return fail("denied");
  if (!expectedState || state !== expectedState) return fail("bad-state");

  let profile;
  let accessToken: string;
  try {
    ({ accessToken } = await exchangeCode(code));
    profile = await fetchProfile(accessToken);
  } catch {
    return fail("exchange-failed");
  }

  const user = upsertGithubUser(profile);
  const programs = activePrograms();

  if (programs.length === 0) {
    // No campaign configured — still sign them in so the page can explain.
    await setParticipantSession({ userId: user.id, githubLogin: profile.login });
    return NextResponse.redirect(new URL("/my/certificate", url.origin));
  }

  // The program is chosen by ?program=, else the only/first active one.
  const requested = url.searchParams.get("program");
  const program = programs.find((row) => String(row.id) === requested) ?? programs[0]!;

  let eligible = false;
  try {
    const verdict = await checkEligibility(profile.login, accessToken, {
      repos: program.repos,
      contributionFrom: program.contributionFrom,
      contributionTo: program.contributionTo,
    });
    // Fail closed on a GitHub error, but do not deny on a transport problem:
    // an unreachable API should not look like a rejection.
    eligible = verdict.error ? false : verdict.eligible;
  } catch {
    eligible = false;
  }

  // Reconcile this person against the roster a scan produced: fill in what only
  // they can supply (numeric id, avatar) so the admin's list shows who has
  // actually turned up, and their claim can tick the row off.
  if (findCandidate(program.id, profile.login)) {
    attachGithubIdentity(program.id, profile.login, profile.githubId, profile.avatarUrl);
  }

  recordEligibility(user.id, eligible);
  await setParticipantSession({ userId: user.id, githubLogin: profile.login });

  return NextResponse.redirect(
    new URL(`/my/certificate?program=${program.id}&eligible=${eligible ? "1" : "0"}`, url.origin),
  );
}
