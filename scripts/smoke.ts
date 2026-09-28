/**
 * End-to-end smoke test against a running dev/prod server.
 *
 *   npm run dev            # in one terminal
 *   npm run smoke          # in another
 *
 * Drives a real browser through: login → create user → issue certificate →
 * render → download PDF → verify via the QR target. Screenshots land in
 * --out (default /tmp/smoke) so the RTL layout can be eyeballed.
 */
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${process.env.SMOKE_PORT ?? "3000"}`;
const PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";
const outIdx = process.argv.indexOf("--out");
const OUT = resolve(outIdx === -1 ? "/tmp/smoke" : process.argv[outIdx + 1]!);

let step = 0;
const failures: string[] = [];

function ok(label: string) {
  step++;
  console.log(`  ${String(step).padStart(2)}. ✓ ${label}`);
}

function fail(label: string, detail?: string) {
  step++;
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ${String(step).padStart(2)}. ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Count entries in a ZIP by scanning for local file headers. */
async function countZipEntries(path: string): Promise<number> {
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(path);
  let count = 0;
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer.readUInt32LE(i) === 0x04034b50) count++;
  }
  return count;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "ar",
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  try {
    /* ---------------- auth ---------------- */
    console.log("\nauth");
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/login")) fail("guard redirects /admin → /login", page.url());
    else ok("guard redirects /admin → /login");

    await shot(page, "01-login");

    // Wrong password must be rejected.
    await page.fill("#password", "definitely-wrong");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1200);
    if (await page.locator('[role="alert"]').count()) ok("wrong password is rejected");
    else fail("wrong password is rejected", "no alert shown");
    await shot(page, "02-login-error");

    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/admin", { timeout: 20_000 }).catch(() => undefined);
    if (page.url().endsWith("/admin")) ok("login succeeds and lands on /admin");
    else fail("login succeeds and lands on /admin", page.url());
    await page.waitForTimeout(800);
    await shot(page, "03-dashboard");

    /* ---------------- users ---------------- */
    console.log("\nusers");
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    await shot(page, "04-users");

    const unique = `مستخدم اختبار ${Date.now() % 100000}`;
    await page.click('button:has-text("إضافة مستخدم")');
    await page.waitForTimeout(500);
    await page.fill("#field-name", unique);
    await page.fill("#field-email", "smoke@example.com");
    // Exercise the gender field: this recipient must get feminine wording.
    await page.click('label:has-text("أنثى") input[type="radio"]');
    await page.click('button[type="submit"]:has-text("حفظ")');
    await page.waitForTimeout(2000);

    if (await page.getByText(unique).count()) ok(`create user "${unique}" (أنثى)`);
    else fail(`create user "${unique}"`, "not in table");
    if (await page.getByText("أنثى").count()) ok("gender recorded and shown in the table");
    else fail("gender recorded and shown in the table", "no أنثى badge");
    await shot(page, "05-user-created");

    // Bulk add
    await page.click('button:has-text("إضافة دفعة")');
    await page.waitForTimeout(500);
    const bulkNames = `دفعةأولى ${Date.now() % 1000}\nدفعةثانية ${Date.now() % 1000}`;
    await page.fill("#bulk-names", bulkNames);
    await shot(page, "06-bulk-dialog");
    await page.click('button[type="submit"]:has-text("إضافة")');
    await page.waitForTimeout(2200);
    const bulkAdded = (await page.getByText("دفعة").count()) > 0;
    if (bulkAdded) ok("bulk add users");
    else fail("bulk add users", "no bulk rows visible");

    /* ---------------- certificates ---------------- */
    console.log("\ncertificates");
    await page.goto(`${BASE}/admin/certs`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    await shot(page, "07-certs-empty-or-not");

    await page.click('button:has-text("إصدار شهادة")');
    await page.waitForTimeout(600);
    await page.click(`label:has-text("${unique}")`);
    await shot(page, "08-issue-dialog");
    await page.click('button[type="submit"]:has-text("إصدار")');
    await page.waitForTimeout(2500);

    // Scope to the row for the user we just created, not merely the first row.
    const row = page.locator("table tr", { hasText: unique }).first();
    const codeText = ((await row.textContent()) ?? "").match(/ITQ-\d{4}-\d{4}/)?.[0] ?? "";

    // Regression guard: ticking one recipient must issue exactly one
    // certificate. A hidden input rendered for every row would issue to all.
    const rowsForNewUser = await page.locator("table tr", { hasText: unique }).count();
    if (rowsForNewUser === 1) ok("exactly one certificate issued for the selected user");
    else fail("exactly one certificate issued for the selected user", `${rowsForNewUser} rows`);

    if (/ITQ-\d{4}-\d{4}/.test(codeText)) ok(`issue certificate → ${codeText}`);
    else fail("issue certificate", `no code found in table`);
    await shot(page, "09-cert-issued");

    /* ---------------- render + download ---------------- */
    console.log("\nrender");
    // Give the worker a moment, then pull the PDF through the admin route.
    await page.waitForTimeout(2500);
    // Download the certificate we just issued, not merely the first row.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }).catch(() => null),
      page
        .locator("table tr", { hasText: unique })
        .first()
        .locator('a[aria-label="تحميل PDF"]')
        .click(),
    ]);
    if (download) {
      const path = resolve(OUT, "certificate.pdf");
      await download.saveAs(path);
      ok(`download PDF → ${download.suggestedFilename()}`);

      // The PDF is vector text, so the gendered wording is extractable.
      // Note the lookaheads: the masculine forms are prefixes of the feminine
      // ones ("لوجهه" ⊂ "لوجهها"), so a plain substring test matches both.
      const { extractPdfText, pdfTextAvailable } = await import("./pdf-text.ts");
      if (!(await pdfTextAvailable())) {
        console.log("     (skipped PDF wording check — pdftotext not installed)");
      } else {
        const text = await extractPdfText(path);
        // لوجهه الكريم refers to الله and is masculine for everyone, so it is
        // not a gender signal. لجهودها and ساهمت are.
        const female = /ساهمت/.test(text) && /لجهودها/.test(text);
        const male = /ساهم(?!ت)/.test(text) && /لجهوده(?!ا)/.test(text);
        if (female && !male) ok("PDF carries the feminine wording (ساهمت / لجهودها)");
        else if (male && !female) fail("PDF wording", "expected feminine, got masculine");
        else fail("PDF wording", `ambiguous (female=${female} male=${male})`);

        if (/لوجهه الكريم/.test(text)) ok("PDF says لوجهه الكريم (Allah, always masculine)");
        else fail("PDF says لوجهه الكريم", "not found");
      }
    } else {
      fail("download PDF", "no download event (render may have timed out)");
    }

    /* ---------------- bulk archive ---------------- */
    console.log("\narchive");
    const [zip] = await Promise.all([
      page.waitForEvent("download", { timeout: 180_000 }).catch(() => null),
      page.click('button:has-text("تنزيل الكل")'),
    ]);
    if (zip) {
      const zipPath = resolve(OUT, "certificates.zip");
      await zip.saveAs(zipPath);
      const { size } = await stat(zipPath);
      const entries = await countZipEntries(zipPath);
      if (size > 1000 && entries > 0) {
        ok(`download ZIP → ${entries} file(s), ${Math.round(size / 1024)} KB`);
      } else {
        fail("download ZIP", `suspiciously small: ${size} bytes, ${entries} entries`);
      }
    } else {
      fail("download ZIP", "no download event");
    }

    /* ---------------- QR is a live link ---------------- */
    console.log("\nqr link");
    const { extractPdfAnnots, hasLinkAnnots } = await import("./pdf-annot.ts");
    const pdf = resolve(OUT, "certificate.pdf");
    const annots = await extractPdfAnnots(pdf).catch(() => []);
    const expected = codeText.replace(/[^0-9]/g, "");
    if (await hasLinkAnnots(pdf)) {
      ok("PDF contains a link annotation");
    } else {
      fail("PDF contains a link annotation", "no /Subtype /Link");
    }
    const target = annots.find((uri) => uri.includes(expected));
    if (target) ok(`QR links to this certificate: ${target}`);
    else fail("QR links to this certificate", `expected ${expected}, got ${annots.join(", ") || "none"}`);

    /* ---------------- public verification ---------------- */
    console.log("\nverification");
    const bare = codeText.replace(/[^0-9]/g, "");

    if (bare.length === 8) {
      // The landing page is the verifier: input + instant result + download.
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await shot(page, "10-landing");

      await page.fill("#code", bare);
      await page.click('button[type="submit"]');
      await page.waitForSelector("section", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(900);

      if (await page.getByText("شهادة صالحة").count()) ok(`verify ${bare} → valid`);
      else fail(`verify ${bare} → valid`, "no valid state");
      if (page.url() === `${BASE}/`) ok("result rendered in place (no navigation)");
      else fail("result rendered in place (no navigation)", page.url());
      await shot(page, "11-landing-valid");

      // The PDF must not exist until the download button is clicked.
      const downloadLink = page.locator('a[href*="/download?format=pdf"]');
      if (await downloadLink.count()) ok("download button present in the result");
      else fail("download button present in the result", "no download link");

      // A revoked / unknown code must not leak.
      await page.fill("#code", "20260000");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1200);
      if (await page.getByText("لا توجد شهادة").count()) ok("unknown code → not found");
      else fail("unknown code → not found");
      await shot(page, "12-landing-missing");

      // The printed form works too.
      await page.fill("#code", codeText);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1200);
      if (await page.getByText("شهادة صالحة").count()) ok("verify accepts the ITQ-YYYY-NNNN form");
      else fail("verify accepts the ITQ-YYYY-NNNN form", "no valid state");
    } else {
      fail("verification", `could not parse code from "${codeText}"`);
    }

    /* ---------------- logout ---------------- */
    console.log("\nlogout");
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.click('button:has-text("خروج")');
    await page.waitForTimeout(1500);
    if (page.url().includes("/login")) ok("logout returns to /login");
    else fail("logout returns to /login", page.url());
  } finally {
    if (consoleErrors.length) {
      console.log(`\nconsole errors (${consoleErrors.length}):`);
      for (const error of [...new Set(consoleErrors)].slice(0, 10)) {
        console.log(`  ! ${error.slice(0, 200)}`);
      }
    }
    await browser.close();
  }

  console.log(`\n${"─".repeat(60)}`);
  if (failures.length === 0) {
    console.log(`ALL ${step} CHECKS PASSED   ·   screenshots in ${OUT}`);
  } else {
    console.log(`${failures.length}/${step} CHECKS FAILED:`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
