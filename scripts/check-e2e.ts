/**
 * Self-contained end-to-end check.
 *
 *   npm run check:e2e
 *
 * Builds, provisions a throwaway database, migrates and seeds it, starts the
 * server against it, runs the browser smoke test, then tears everything down.
 *
 * The point is isolation: the smoke test creates users, certificates, campaigns
 * and renders PDFs, so it must never run against the database you actually care
 * about. The scratch DB lives in a temp directory and is deleted afterwards.
 *
 * Why it builds for itself, even though `next build` is usually separate:
 * an incremental build over an existing .next can emit a broken server chunk
 * (pages 500 with `a[d] is not a function`) when a server is running against the
 * same directory. That is a confusing way to fail, and it has bitten this repo
 * twice. Building clean here costs a few seconds and removes the whole class.
 *
 *   E2E_KEEP=1       keep the scratch directory for inspection
 *   E2E_SKIP_BUILD=1 reuse an existing build (faster, less trustworthy)
 *   E2E_PORT=3199    port for the throwaway server
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.E2E_PORT ?? "3199";
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "e2e-password";
const OUT = process.env.E2E_OUT ?? "/tmp/smoke-e2e";

/** Run a command, inheriting stdio. Resolves with the exit code. */
function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<number> {
  return new Promise((done) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    child.on("close", (code) => done(code ?? 1));
    child.on("error", () => done(1));
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function rule(label: string) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 52 - label.length))}`);
}

async function main() {
  const scratch = await mkdtemp(join(tmpdir(), "itqan-e2e-"));
  const dbUrl = `file:${join(scratch, "e2e.db")}`;

  // Pinned rather than inherited: the roster checks deliberately exercise the
  // "no scan credential" path, so a GITHUB_SCAN_TOKEN exported in the
  // developer's shell must not silently change what is tested. The credentialed
  // path is covered by check:roster instead.
  const env = {
    DATABASE_URL: dbUrl,
    ADMIN_PASSWORD: PASSWORD,
    GITHUB_SCAN_TOKEN: "",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
  };

  console.log(`\nscratch database: ${dbUrl}`);

  let server: ReturnType<typeof spawn> | undefined;

  try {
    if (process.env.E2E_SKIP_BUILD) {
      rule("build (skipped)");
      console.log("  reusing the existing .next — E2E_SKIP_BUILD=1");
    } else {
      rule("build");
      await rm(resolve(ROOT, ".next"), { recursive: true, force: true });
      if ((await run("npx", ["next", "build"])) !== 0) throw new Error("build failed");
    }

    await mkdir(join(scratch, "storage"), { recursive: true });

    rule("migrate");
    if ((await run("npx", ["drizzle-kit", "migrate"], env)) !== 0) throw new Error("migrate failed");

    rule("seed");
    if ((await run("npx", ["tsx", "scripts/seed.ts"], env)) !== 0) throw new Error("seed failed");

    rule("start");
    server = spawn("npx", ["next", "start", "--port", PORT], {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, ...env },
      detached: true,
    });
    if (!(await waitForServer(`${BASE}/login`, 40_000))) {
      throw new Error(`server did not come up on ${BASE}`);
    }
    console.log(`  ready on ${BASE}`);

    rule("smoke");
    const code = await run("npx", ["tsx", "scripts/smoke.ts", "--out", OUT], {
      SMOKE_BASE_URL: BASE,
      SMOKE_CONFIRM_WRITES: "1",
      ADMIN_PASSWORD: PASSWORD,
    });
    if (code !== 0) process.exitCode = code;
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (server?.pid) {
      // The child is detached, so kill its whole group.
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
    if (process.env.E2E_KEEP) {
      console.log(`\nkept scratch directory: ${scratch}`);
    } else {
      await rm(scratch, { recursive: true, force: true });
      console.log("scratch directory removed");
    }
  }
}

main();
