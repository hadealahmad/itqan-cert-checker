/**
 * Exercises the eligibility check against the real GitHub API.
 *
 *   GITHUB_TOKEN=<a PAT> npm run check:github
 *
 * Uses your own token so the permission probe sees a real caller's rights.
 * With a PAT the results are still meaningful for the "no access" case, which
 * is the common one — it simply cannot prove the "maintainer" branch.
 */
import {
  checkEligibility,
  classifySupervisor,
  codeownersMaintainers,
  parseCodeowners,
  collaboratorRole,
  isMaintainer,
  mergedPullRequestAuthors,
  mergedPullRequests,
  repoPermissions,
  ROSTER_MAX_PRS_PER_REPO,
  scanRoster,
} from "../src/lib/github.ts";

async function main() {
  const TOKEN = process.env.GITHUB_TOKEN;
  if (!TOKEN) {
    console.error("Set GITHUB_TOKEN=<a GitHub PAT> to run this check.");
    process.exit(1);
  }

  let failures = 0;
  function check(ok: boolean, label: string, detail = "") {
    console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  }

  const me = (await (await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "itqan-cert-checker" },
  })).json()) as { login: string };

  console.log(`\nacting as @${me.login}\n`);
  console.log("repo permission probe");
  console.log("-".repeat(60));

  // 1. A repo we do not control -> nobody is a maintainer.
  check(
    !(await isMaintainer({ owner: "facebook", repo: "react" }, TOKEN)),
    "not a maintainer of facebook/react",
  );

  // 2. Our own repo -> we are an owner, so the flag must be set.
  const own = await repoPermissions({ owner: me.login, repo: "itqan-cert-checker" }, TOKEN);
  check(own.admin === true, `is admin of ${me.login}/itqan-cert-checker`, JSON.stringify(own));

  console.log("\ncontribution window probe");
  console.log("-".repeat(60));

  // 3. Merged PRs are found and the date range is respected.
  const wide = await mergedPullRequests(
    { owner: "inertiajs", repo: "inertia" },
    "pascalbaljet",
    "2020-01-01",
    "2026-12-31",
    TOKEN,
  );
  check(wide.total > 0, "finds merged PRs by author", `total=${wide.total}`);

  const narrow = await mergedPullRequests(
    { owner: "inertiajs", repo: "inertia" },
    "pascalbaljet",
    "2000-01-01",
    "2000-12-31",
    TOKEN,
  );
  check(narrow.total === 0, "an impossible date range returns 0", `total=${narrow.total}`);

  console.log("\nfull eligibility verdict");
  console.log("-".repeat(60));

  // 4. A non-maintainer contributor to a real repo should be eligible.
  const eligible = await checkEligibility("pascalbaljet", TOKEN, {
    repos: [{ owner: "inertiajs", repo: "inertia" }],
    contributionFrom: "2020-01-01",
    contributionTo: "2026-12-31",
  });
  check(eligible.eligible, "contributor is eligible", `via ${eligible.contributedTo?.owner}/${eligible.contributedTo?.repo}`);

  // 5. Someone with no contributions in the window is not.
  const ineligible = await checkEligibility("pascalbaljet", TOKEN, {
    repos: [{ owner: "inertiajs", repo: "inertia" }],
    contributionFrom: "2000-01-01",
    contributionTo: "2000-12-31",
  });
  check(!ineligible.eligible, "no contributions in the window is ineligible");

  console.log("\nroster scan: role lookup");
  console.log("-".repeat(60));

  // The reverse question the login path cannot ask: what role does *this* person
  // hold, as seen by a token with push on the repo.
  const ownRole = await collaboratorRole(
    { owner: me.login, repo: "itqan-cert-checker" },
    me.login,
    TOKEN,
  );
  check(ownRole === "admin", "reads our own admin role", `role=${ownRole}`);

  const stranger = await collaboratorRole(
    { owner: me.login, repo: "itqan-cert-checker" },
    "definitely-not-a-user-zzz9911",
    TOKEN,
  );
  check(stranger === "member", "a non-collaborator reads as member", `role=${stranger}`);

  // The case that matters most: a repo we do not administer. GitHub answers 403
  // ("must have push access"), which must NOT be read as "not a maintainer".
  // (facebook/react is deliberately not used here: it 301s to a new name, so it
  // would fail for the wrong reason.)
  const noAccess = await collaboratorRole(
    { owner: "inertiajs", repo: "inertia" },
    "pascalbaljet",
    TOKEN,
  );
  check(
    noAccess === "unknown",
    "a repo we cannot read is unknown, not a pass",
    `role=${noAccess}`,
  );

  console.log("\nroster scan: author enumeration");
  console.log("-".repeat(60));

  const full = await mergedPullRequestAuthors(
    { owner: "inertiajs", repo: "inertia" },
    "2020-01-01",
    "2026-12-31",
    TOKEN,
  );
  check(full.authors.length > 0, "collects authors without a login filter", `authors=${full.authors.length}`);
  check(full.totalMatched > 0, "reports the true total", `total=${full.totalMatched}`);
  check(
    full.authors.every((a) => a.count >= 1 && a.sample?.htmlUrl),
    "every author carries a count and a PR link",
  );
  check(
    full.authors.every((a, i, arr) => i === 0 || arr[i - 1]!.count >= a.count),
    "authors are ordered by contribution",
  );
  // Automation must never be offered a certificate: merged dependency bumps look
  // exactly like human contributions in the search index.
  check(
    full.authors.every((a) => a.login.toLowerCase().endsWith("[bot]") === false),
    "bot accounts are excluded from the roster",
    `${full.authors.length} human authors`,
  );

  // Truncation must be reported, never hidden: a capped scan that claims to be
  // complete would have the admin trust a list that is missing people.
  const capped = await mergedPullRequestAuthors(
    { owner: "inertiajs", repo: "inertia" },
    "2020-01-01",
    "2026-12-31",
    TOKEN,
    100,
  );
  check(capped.truncated === true, "a capped scan reports itself truncated", `truncated=${capped.truncated}`);
  check(
    capped.totalMatched === full.totalMatched,
    "truncation does not change the reported total",
    `total=${capped.totalMatched}`,
  );

  console.log("\nroster scan: end to end");
  console.log("-".repeat(60));

  // Our own repo, where the token has push. Whatever it finds, the loop must
  // complete and every row must carry a status the UI knows how to render.
  const scan = await scanRoster(
    {
      repos: [{ owner: me.login, repo: "itqan-cert-checker" }],
      contributionFrom: "2020-01-01",
      contributionTo: "2026-12-31",
    },
    TOKEN,
  );
  check(Array.isArray(scan.entries), "scanRoster returns entries and notes");
  check(
    scan.entries.every((e) => ["eligible", "maintainer", "unverified"].includes(e.status)),
    "every scanned row has a renderable status",
    `${scan.entries.length} rows`,
  );

  // The load-bearing case: a repo whose contributions we CAN read, but whose
  // permissions we cannot. The scan must produce real rows — and every one of
  // them must land in the review queue rather than be approved.
  const blind = await scanRoster(
    {
      repos: [{ owner: "inertiajs", repo: "inertia" }],
      contributionFrom: "2020-01-01",
      contributionTo: "2026-12-31",
    },
    TOKEN,
  );
  check(
    blind.entries.length > 0,
    "a blind scan still finds contributors",
    `${blind.entries.length} rows`,
  );
  check(
    blind.entries.every((e) => e.status === "unverified"),
    "a blind scan approves nobody",
    `statuses=${[...new Set(blind.entries.map((e) => e.status))].join(",")}`,
  );
  check(
    blind.entries.every((e) => e.mergedPrCount > 0 && e.qualifiedIn),
    "blind rows still carry their evidence",
  );
  check(
    blind.entries.every((e) => !e.login.toLowerCase().endsWith("[bot]")),
    "the blind scan excluded bots too",
  );

  // And a repo that is gone entirely must be reported, not silently skipped.
  const gone = await scanRoster(
    {
      repos: [{ owner: "itqan-org", repo: "no-such-repo-zzz9911" }],
      contributionFrom: "2020-01-01",
      contributionTo: "2026-12-31",
    },
    TOKEN,
  );
  check(gone.entries.length === 0, "a missing repo yields no rows", `${gone.entries.length} rows`);
  check(gone.notes.length > 0, "a missing repo is reported to the admin", `notes=${gone.notes.length}`);

  console.log("\nmaintainers without owner credentials");
  console.log("-".repeat(60));

  // The claim under test: a campaign can exclude supervisors with no token that
  // has push on the repositories, because the organisation declares them.
  const declared = new Set(["pascalbaljet"]);
  const asDeclared = await classifySupervisor(
    "pascalbaljet",
    [{ owner: "inertiajs", repo: "inertia" }],
    TOKEN,
    declared,
  );
  check(
    asDeclared.status === "maintainer",
    "a declared maintainer is excluded with no push access",
    asDeclared.reason,
  );

  const asCodeowner = await classifySupervisor(
    "pascalbaljet",
    [{ owner: "inertiajs", repo: "inertia" }],
    TOKEN,
    new Set(),
    new Map([["pascalbaljet", "مذكور في CODEOWNERS"]]),
  );
  check(
    asCodeowner.status === "maintainer",
    "a CODEOWNERS maintainer is excluded with no push access",
    asCodeowner.reason,
  );

  const asNobody = await classifySupervisor(
    "pascalbaljet",
    [{ owner: "inertiajs", repo: "inertia" }],
    TOKEN,
    new Set(),
  );
  check(
    asNobody.status === "unverified",
    "with no declared list and no push, nobody is auto-approved",
    asNobody.status,
  );

  // CODEOWNERS mostly names teams, which cannot be resolved from outside the
  // org. Skipping them is deliberate; treating @org/team as a person is not.
  check(
    parseCodeowners("*  @nodejs/tsc @bmuenzenmeyer").join(",") === "bmuenzenmeyer",
    "CODEOWNERS teams are skipped, people are kept",
    parseCodeowners("*  @nodejs/tsc @bmuenzenmeyer").join(","),
  );

  const owners = await codeownersMaintainers({ owner: "github", repo: "docs" });
  check(
    owners.path === null || owners.logins.length > 0,
    "a CODEOWNERS lookup resolves or reports nothing",
    `path=${owners.path} logins=${owners.logins.length}`,
  );

  console.log();
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("All GitHub API checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
