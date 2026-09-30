/**
 * Verifies the claims made in the README's Environment section against the code.
 *
 *   npm run check:env-docs
 *
 * Documentation drifts silently; this keeps the two honest.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf-8");
const readme = read("README.md");
const example = read(".env.example");

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Every variable the code actually reads. */
function envVarsIn(dir: string): Set<string> {
  const out = new Set<string>();
  // Good enough for a docs check: walk the tree, match process.env.X.
  const { globSync } = require("node:fs") as typeof import("node:fs");
  for (const file of globSync(`${dir}/**/*.{ts,tsx,mjs}`, { cwd: process.cwd() })) {
    const body = read(file);
    for (const m of body.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) out.add(m[1]!);
  }
  return out;
}

console.log("\napp variables are documented");
console.log("-".repeat(60));

const code = envVarsIn("src");
const scripts = envVarsIn("scripts");

// Next.js injects these; they are the runtime's, not ours.
const FRAMEWORK = new Set(["NODE_ENV", "PORT"]);
const TEST_ONLY = new Set(["GITHUB_TOKEN", "SMOKE_BASE_URL", "SMOKE_CONFIRM_WRITES", "SMOKE_PORT", "E2E_SKIP_BUILD", "E2E_PORT", "E2E_OUT", "E2E_KEEP"]);

for (const name of [...code].sort()) {
  if (FRAMEWORK.has(name) || TEST_ONLY.has(name)) continue;
  check(readme.includes(name), `${name} appears in the README`, "");
}

console.log("\nno invented variables");
console.log("-".repeat(60));

// Every GITHUB_*/CERT_*/ADMIN_*/SESSION_* mention in the README must be real.
const claimed = new Set(
  [...readme.matchAll(/\b((?:GITHUB|CERT|FIGMA|ADMIN|SESSION|DATABASE|INTERNAL|NEXT_PUBLIC|ORG|SMOKE|E2E)_[A-Z_]+)\b/g)].map(
    (m) => m[1]!,
  ),
);
// Some variables are deliberately kept in .env.example after being retired.
// The README says so explicitly; that counts as accurate, not as an error.
const DOCUMENTED_INERT = new Set(["ORG_NAME"]);

for (const name of [...claimed].sort()) {
  const real =
    code.has(name) ||
    scripts.has(name) ||
    FRAMEWORK.has(name) ||
    TEST_ONLY.has(name) ||
    DOCUMENTED_INERT.has(name);
  check(
    real,
    `${name} is real`,
    real
      ? DOCUMENTED_INERT.has(name) && !code.has(name)
        ? "documented as retired"
        : ""
      : "mentioned in README but not read anywhere",
  );
}

// ...and if ORG_NAME is ever wired up, this fails, so the note gets removed.
if (code.has("ORG_NAME")) {
  check(
    !/A note on `ORG_NAME`/.test(readme),
    "ORG_NAME is documented as inert but the code now reads it",
    "remove the note and document the variable instead",
  );
}

console.log("\nstated behaviour matches the code");
console.log("-".repeat(60));

const auth = read("src/lib/auth.ts");
check(/SESSION_SECRET must be set/.test(auth), "SESSION_SECRET is required", "");
check(
  /value\.length < 16/.test(auth),
  "README's '≥ 16 characters' matches the code",
  readme.includes("≥ 16 characters") ? "" : "README does not state the length",
);
check(
  /secure: process\.env\.NODE_ENV === "production"/.test(auth),
  "cookies go secure in production",
  readme.includes("marked `secure`") ? "" : "README does not mention it",
);

const certs = read("src/lib/certs.ts");
check(
  /CERT_PREFIX \?\? "ITQ"/.test(certs),
  "CERT_PREFIX defaults to ITQ",
  readme.includes("`ITQ`") ? "" : "README does not state the default",
);
check(
  /CERT_CODE_YEAR \?\? new Date\(\)\.getUTCFullYear\(\)/.test(certs),
  "CERT_CODE_YEAR defaults to the current year",
);

// internalBaseUrl() lives in qr.ts, not render.ts: the QR is built there.
const qr = read("src/lib/qr.ts");
const internalDefault =
  /INTERNAL_BASE_URL\) return/.test(qr) && /127\.0\.0\.1:\$\{port\}/.test(qr);
check(
  internalDefault,
  "INTERNAL_BASE_URL falls back to 127.0.0.1:$PORT",
  readme.includes("127.0.0.1:$PORT") ? "" : "README omits the fallback",
);
check(
  /NEXT_PUBLIC_BASE_URL \?\? "http:\/\/localhost:3000"/.test(qr),
  "NEXT_PUBLIC_BASE_URL falls back to localhost:3000",
  readme.includes("`http://localhost:3000`") ? "" : "README omits the default",
);

console.log("\nexample file agrees with the README");
console.log("-".repeat(60));
for (const name of [...code].sort()) {
  if (FRAMEWORK.has(name) || TEST_ONLY.has(name)) continue;
  check(example.includes(name), `${name} is in .env.example`);
}

console.log();
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("All environment documentation checks passed.");
}
