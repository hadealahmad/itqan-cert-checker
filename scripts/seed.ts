/**
 * Seeds the template catalogue and a few sample people + certificates.
 *
 *   npm run db:seed
 */
import { findUserByNameKey, getUser, issueCertificate, createUser } from "../src/lib/certs.ts";
import { defaultTemplate, syncTemplateCatalogue } from "../src/lib/programs.ts";
import { toISODate } from "../src/lib/dates.ts";
import { nameKey } from "../src/lib/utils.ts";

const PEOPLE = [
  { name: "بشرى أحمد الصيعري", gender: "female", email: "bushra@example.com" },
  { name: "عبدالله محمد الغامدي", gender: "male", email: "abdullah@example.com" },
  { name: "نورة سعد القحطاني", gender: "female", email: null },
] as const;

const ISSUE_DATE = "2026-10-10";

syncTemplateCatalogue();
const template = defaultTemplate();
console.log(`template: ${template.slug} (${template.nameAr})`);

for (const person of PEOPLE) {
  const key = nameKey(person.name);
  let user = findUserByNameKey(key);
  if (!user) {
    user = createUser({ name: person.name, gender: person.gender, email: person.email });
    console.log(`+ user  ${user.name}`);
  }
  const existing = getUser(user.id);
  if (!existing) continue;
  try {
    const cert = issueCertificate({
      userId: user.id,
      templateId: template.id,
      source: "admin",
      issuedOn: ISSUE_DATE,
    });
    console.log(`+ cert  ${cert.code}  ->  ${user.name}`);
  } catch (error) {
    if ((error as Error).name === "DuplicateCertificateError") {
      console.log(`= cert  ${user.name} already holds one for this template`);
      continue;
    }
    throw error;
  }
}

console.log(`\nIssue date used: ${ISSUE_DATE} (${toISODate(ISSUE_DATE)})`);
console.log("No programs seeded — create one at /admin/programs to enable GitHub sign-in.");
