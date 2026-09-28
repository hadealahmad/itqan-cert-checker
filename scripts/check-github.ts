/**
 * Exercises the eligibility check against the real GitHub API.
 *
 *   GITHUB_TOKEN=<a PAT> npm run check:github
 *
 * Uses your own token so the permission probe sees a real caller's rights.
 * With a PAT the results are still meaningful for the "no access" case, which
 * is the common one — it simply cannot prove the "maintainer" branch.
 */
import { checkEligibility, isMaintainer, mergedPullRequests, repoPermissions } from "../src/lib/github.ts";

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
