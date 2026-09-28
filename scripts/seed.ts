/**
 * Seeds a couple of users and certificates so the print route can be checked
 * against the Figma reference render.
 *
 *   npm run db:seed
 */
import { eq } from "drizzle-orm";

import { createUser, findUserByNameKey, issueCertificate } from "../src/lib/certs.ts";
import { db } from "../src/lib/db/index.ts";
import { certificates } from "../src/lib/db/schema.ts";
import { toISODate } from "../src/lib/dates.ts";
import { nameKey } from "../src/lib/utils.ts";

const PEOPLE = [
  { name: "بشرى أحمد الصيعري", gender: "female", email: "bushra@example.com" },
  { name: "عبدالله محمد الغامدي", gender: "male", email: "abdullah@example.com" },
  { name: "نورة سعد القحطاني", gender: "female", email: null },
] as const;

// Fixed so the render is reproducible between runs.
const ISSUE_DATE = "2026-10-10";

const existing = db.select({ id: certificates.id }).from(certificates).all();
if (existing.length > 0) {
  console.log(`Seed skipped — ${existing.length} certificate(s) already present.`);
  process.exit(0);
}

for (const person of PEOPLE) {
  const key = nameKey(person.name);
  let user = findUserByNameKey(key);
  if (!user) {
    user = createUser({ name: person.name, gender: person.gender, email: person.email ?? null });
    console.log(`+ user  ${user.name}`);
  }
  const cert = issueCertificate({ userId: user.id, issuedOn: ISSUE_DATE });
  console.log(`+ cert  ${cert.code}  ->  ${user.name}`);
}

const [first] = db.select().from(certificates).where(eq(certificates.serial, "0001")).all();
if (first) {
  console.log(`\nPrint URL: /p/${first.printToken}  (code ${first.code})`);
}
console.log(`Issue date used: ${ISSUE_DATE} (${toISODate(ISSUE_DATE)})`);
