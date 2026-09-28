/**
 * Renders the certificate print route, writes a PNG, and reports the geometry
 * Chromium actually laid out for every text layer — so it can be diffed against
 * the coordinates read out of Figma.
 *
 *   npx tsx scripts/compare.ts [--out /tmp/cmp]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import { DYNAMIC_TEXT, FRAME, STATIC_TEXT } from "../src/lib/cert-template.ts";

const BASE = process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
const outIdx = process.argv.indexOf("--out");
const OUT = resolve(outIdx === -1 ? "/tmp/cmp" : process.argv[outIdx + 1]!);
const REFERENCE = resolve("assets/_figma-raw/frame3.png");

/**
 * Serialised as a source string on purpose: tsx/esbuild rewrites arrow
 * functions with a `__name` helper that does not exist inside the page.
 */
const MEASURE = `(() => {
  const root = document.querySelector('main > div');
  if (!root) return { error: 'certificate root not found' };
  const rootBox = root.getBoundingClientRect();
  const boxes = [];
  for (const el of Array.from(root.children)) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    boxes.push({
      tag: el.tagName,
      kind: el.tagName === 'IMG' ? 'img' : (el.getAttribute('role') === 'img' ? 'qr' : 'text'),
      text: (el.textContent || '').trim().slice(0, 44),
      src: el.tagName === 'IMG' ? el.getAttribute('src') : null,
      x: +(r.left - rootBox.left).toFixed(1),
      y: +(r.top - rootBox.top).toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      fontFamily: cs.fontFamily.split(',')[0].replace(/"/g, ''),
      color: cs.color,
    });
  }
  return { rootW: rootBox.width, rootH: rootBox.height, boxes };
})()`;

async function main() {
  const db = new Database("./data/cert-checker.db", { readonly: true });
  const row = db
    .prepare("select print_token, code, recipient_name from certificates order by id limit 1")
    .get() as { print_token: string; code: string; recipient_name: string };
  db.close();

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: FRAME.width, height: FRAME.height } });

  const url = `${BASE}/p/${row.print_token}`;
  console.log("→", url, `(${row.code} / ${row.recipient_name})`);
  const response = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  if (!response?.ok()) throw new Error(`print route returned ${response?.status()}`);

  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(250);

  const shot = resolve(OUT, "render.png");
  await page.screenshot({ path: shot, fullPage: false });

  const measured = (await page.evaluate(MEASURE)) as {
    rootW: number;
    rootH: number;
    boxes: Array<Record<string, unknown>>;
  };

  // Ask the browser which font actually got used for Arabic runs.
  const fontCheck = (await page.evaluate(`(() => {
    const probe = document.createElement('span');
    probe.textContent = 'تجربة';
    probe.style.cssText = 'position:absolute;font-size:100px;font-weight:400';
    document.body.appendChild(probe);
    const loaded = Array.from(document.fonts).map(f => f.family + ' ' + f.weight + ' ' + f.status);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return { loaded, width100px: +w.toFixed(1) };
  })()`)) as { loaded: string[]; width100px: number };

  await browser.close();
  await writeFile(resolve(OUT, "measured.json"), JSON.stringify({ ...measured, fontCheck }, null, 2));

  console.log(`\nroot: ${measured.rootW} x ${measured.rootH}  (expected ${FRAME.width} x ${FRAME.height})`);
  console.log(`fonts: ${fontCheck.loaded.join(" | ") || "(none reported)"}`);

  const boxes = measured.boxes;
  console.log(`\n--- artwork (${boxes.filter((b) => b.kind === "img").length}) ---`);
  for (const b of boxes.filter((b) => b.kind === "img")) {
    console.log(
      `  ${String(b.src).padEnd(30)} ${String(b.x).padStart(7)} ${String(b.y).padStart(7)} ${String(b.w).padStart(7)}x${String(b.h).padStart(7)}`,
    );
  }

  console.log(`\n--- text runs (${boxes.filter((b) => b.kind === "text").length}) ---`);
  console.log("  " + "text".padEnd(46) + "x".padStart(8) + "y".padStart(8) + "w".padStart(8) + "h".padStart(7) + "  size/weight/line");
  for (const b of boxes.filter((b) => b.kind === "text")) {
    console.log(
      "  " +
        String(b.text).padEnd(46) +
        String(b.x).padStart(8) +
        String(b.y).padStart(8) +
        String(b.w).padStart(8) +
        String(b.h).padStart(7) +
        `  ${b.fontSize}/${b.fontWeight}/${b.lineHeight}  ${b.color}`,
    );
  }

  const qr = boxes.find((b) => b.kind === "qr");
  console.log(`\n--- qr ---\n  ${qr ? `${qr.x},${qr.y} ${qr.w}x${qr.h}` : "NOT FOUND"}`);
  console.log(`\nPNG        : ${shot}\nReference  : ${REFERENCE}\nMeasured   : ${resolve(OUT, "measured.json")}`);

  // Sanity: does the body paragraph still wrap to two lines like Figma?
  const desc = boxes.find((b) => String(b.text).startsWith("تقديرًا"));
  if (desc) {
    const lines = Math.round(Number(desc.h) / Number(String(desc.lineHeight).replace("px", "")));
    console.log(`\ndescription wraps to ${lines} line(s) — Figma has 2`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
