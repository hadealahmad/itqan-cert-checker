/**
 * Optional pre-warm: renders certificates to PDF + PNG ahead of time.
 *
 *   npm run render              # anything without both files on disk
 *   npm run render -- --force   # re-render everything
 *   npm run render -- 12 13 14  # only these certificate ids
 *
 * Downloads render on demand, so this is never required — it only moves the
 * work earlier. Renders are serialised inside the process, so it is safe to run
 * alongside the web server; Chromium stays a single shared instance.
 */
import Database from "better-sqlite3";

import { hasRenderedFiles, renderCertificate } from "../src/lib/render.ts";

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function positional() {
  return process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
}

async function main() {
  const force = flag("force");
  const only = positional();

  const db = new Database("./data/cert-checker.db", { readonly: true });
  const all = (
    only.length
      ? db
          .prepare(
            `select id, code, recipient_name from certificates
             where id in (${only.map(() => "?").join(",")})`,
          )
          .all(...only)
      : db
          .prepare(`select id, code, recipient_name from certificates order by id`)
          .all()
  ) as Array<{ id: number; code: string; recipient_name: string }>;
  db.close();

  /**
   * Trust the files on disk, not only the stored status. Clearing storage/ (or
   * restoring the database without it) would otherwise leave rows marked "ready"
   * that can never be regenerated.
   */
  const rows = [];
  for (const row of all) {
    if (force || !(await hasRenderedFiles(row.code))) rows.push(row);
  }

  if (rows.length === 0) {
    console.log("Nothing to render — every certificate has both a PDF and a PNG on disk.");
    return;
  }

  console.log(`Rendering ${rows.length} certificate(s)…\n`);
  let ok = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const started = Date.now();
    try {
      const files = await renderCertificate(row.id, force);
      ok++;
      console.log(
        `  ✓ ${row.code}  ${row.recipient_name.padEnd(28)} ${String(Date.now() - started).padStart(6)}ms  ${files.pdf}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${row.code}: ${message}`);
      console.log(`  ✗ ${row.code}  ${row.recipient_name}  — ${message}`);
    }
  }

  console.log(`\n${ok}/${rows.length} rendered.`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
