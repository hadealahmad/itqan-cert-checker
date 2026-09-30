/**
 * Drives a roster scan against a real public repository, the way the admin
 * button does: preflight, access check, scan, upsert, then a per-row recheck.
 *
 *   GITHUB_SCAN_TOKEN=$(gh auth token) npm run check:roster
 *
 * Uses a throwaway database, like check:e2e — the scan writes rows.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function main() {
  const TOKEN = process.env.GITHUB_SCAN_TOKEN;
  if (!TOKEN) {
    console.error("Set GITHUB_SCAN_TOKEN, e.g. GITHUB_SCAN_TOKEN=$(gh auth token)");
    process.exit(1);
  }
  if (!existsSync(resolve(process.cwd(), "data/cert-checker.db"))) {
    console.error("No dev database found.");
    process.exit(1);
  }

  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  const scratch = await mkdtemp(join(tmpdir(), "itqan-roster-"));
  const url = `file:${join(scratch, "roster.db")}`;

  const run = (cmd: string, args: string[], env: Record<string, string>) =>
    new Promise<number>((res) => {
      const child = spawn(cmd, args, {
        cwd: process.cwd(),
        stdio: "ignore",
        env: { ...process.env, ...env },
      });
      child.on("close", (code) => res(code ?? 1));
    });

  try {
    if ((await run("npx", ["drizzle-kit", "migrate"], { DATABASE_URL: url })) !== 0) {
      throw new Error("migrate failed");
    }
    if ((await run("npx", ["tsx", "scripts/seed.ts"], { DATABASE_URL: url })) !== 0) {
      throw new Error("seed failed");
    }

    // Everything below talks to the scratch database, not the real one.
    process.env.DATABASE_URL = url;
    const { db } = await import(resolve(process.cwd(), "src/lib/db/index.ts"));
    void db;

    const { createProgram } = await import(resolve(process.cwd(), "src/lib/programs.ts"));
    const { listCandidates, rosterSummary, upsertRoster, setCandidateStatus } = await import(
      resolve(process.cwd(), "src/lib/roster.ts")
    );
    const { scanAccess, scanRoster } = await import(resolve(process.cwd(), "src/lib/github.ts"));

    const program = createProgram({
      nameAr: "حملة الفحص",
      templateId: 1,
      contributionFrom: "2020-01-01",
      contributionTo: "2026-12-31",
      // A public repo this token has no push on — the honest worst case.
      repos: [{ owner: "inertiajs", repo: "inertia" }],
    });

    console.log("\naccess check");
    console.log("-".repeat(60));
    const access = await scanAccess({ owner: "inertiajs", repo: "inertia" }, TOKEN);
    check(access === "read", "read-only access to a public repo is reported as read", `access=${access}`);

    console.log("\nscan");
    console.log("-".repeat(60));
    const scan = await scanRoster(
      {
        repos: program.repos,
        contributionFrom: program.contributionFrom,
        contributionTo: program.contributionTo,
      },
      TOKEN,
      // Declared, so the roster proves the token-free path works.
      { declaredMaintainers: [] },
    );
    check(scan.entries.length > 0, "found contributors", `${scan.entries.length} rows`);
    check(
      scan.entries.every((e: { login: string }) => !e.login.toLowerCase().endsWith("[bot]")),
      "no bot accounts in the roster",
    );

    const summary = upsertRoster(program.id, scan.entries);
    check(summary.total === scan.entries.length, "roster rows were stored", `total=${summary.total}`);
    check(
      summary.eligible === 0,
      "nothing is auto-approved without push access",
      `eligible=${summary.eligible}, unverified=${summary.unverified}`,
    );

    const stored = listCandidates(program.id);
    check(stored.length > 0, "candidates read back", `${stored.length} rows`);
    check(
      stored.every((r: { githubLogin: string }) => r.githubLogin === r.githubLogin.toLowerCase()),
      "logins are stored lowercased",
    );
    check(
      stored.every((r: { mergedPrCount: number }) => r.mergedPrCount > 0),
      "every row carries a contribution count",
    );
    check(
      stored.every((r: { isManual: number }) => r.isManual === 0),
      "scan-written rows are not marked manual",
    );

    console.log("\nre-scan does not clobber a human decision");
    console.log("-".repeat(60));
    const first = stored[0]!;
    setCandidateStatus(first.id, "eligible", "مؤهل — حُدّد يدويًا");
    check(
      listCandidates(program.id).find((r: { id: number }) => r.id === first.id)!.isManual === 1,
      "a manual ruling is flagged as manual",
    );
    const rescan = await scanRoster(
      {
        repos: program.repos,
        contributionFrom: program.contributionFrom,
        contributionTo: program.contributionTo,
      },
      TOKEN,
    );
    upsertRoster(program.id, rescan.entries);
    const after = listCandidates(program.id).find((r: { id: number }) => r.id === first.id)!;
    check(after.status === "eligible", "a manual decision survives a re-scan", `status=${after.status}`);
    check(after.mergedPrCount > 0, "the count is still refreshed", `count=${after.mergedPrCount}`);
    check(after.id === first.id, "no duplicate row was created");
    check(after.isManual === 1, "the manual flag survives a re-scan");

    // A deliberate re-check is a fresh answer and must be allowed to win.
    setCandidateStatus(first.id, "unverified", "أُعيد الفحص", { manual: false });
    const rechecked = listCandidates(program.id).find((r: { id: number }) => r.id === first.id)!;
    check(rechecked.isManual === 0, "an explicit re-check clears the manual flag");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log();
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("All roster checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
