/**
 * Self-contained end-to-end check.
 *
 *   npm run build && npm run check:e2e
 *
 * Provisions a throwaway database, migrates and seeds it, starts the built
 * server against it, runs the browser smoke test, then tears everything down.
 *
 * The point is isolation: the smoke test creates users, certificates, campaigns
 * and renders PDFs, so it must never run against the database you actually care
 * about. The scratch DB lives in a temp directory and is deleted afterwards.
 *
 *   E2E_KEEP=1     keep the scratch directory for inspection
 *   E2E_PORT=3199  port for the throwaway server
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", () => resolvePromise(1));
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Any 200 from the app means the server is serving, not just bound.
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
    console.error("No production build found. Run `npm run build` first.");
    process.exit(1);
  }

  const scratch = await mkdtemp(join(tmpdir(), "itqan-e2e-"));
  const dbUrl = `file:${join(scratch, "e2e.db")}`;
  const env = { DATABASE_URL: dbUrl, ADMIN_PASSWORD: PASSWORD };

  console.log(`\nscratch database: ${dbUrl}`);

  let server: ReturnType<typeof spawn> | undefined;

  try {
    await mkdir(join(scratch, "storage"), { recursive: true });

    for (const [label, cmd, args] of [
      ["migrate", "npx", ["drizzle-kit", "migrate"]],
      ["seed", "npx", ["tsx", "scripts/seed.ts"]],
    ] as const) {
      process.stdout.write(`\n── ${label} ${"─".repeat(Math.max(0, 52 - label.length))}\n`);
      if ((await run(cmd, [...args], env)) !== 0) {
        throw new Error(`${label} failed`);
      }
    }

    console.log(`\n── start ${"─".repeat(47)}`);
    server = spawn("npx", ["next", "start", "--port", PORT], {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, ...env },
      detached: true,
    });

    if (!(await waitForServer(`${BASE}/login`, 40_000))) {
      throw new Error(`server did not come up on ${BASE}`);
    }
    console.log(`ready on ${BASE}`);

    console.log(`\n── smoke ${"─".repeat(47)}`);
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
