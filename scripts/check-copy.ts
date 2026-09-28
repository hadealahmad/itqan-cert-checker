/**
 * Guards the gender-aware copy against breaking the certificate layout.
 *
 * The feminine wording is a few characters longer than the masculine, which can
 * push the body paragraph onto a third line — where it would collide with the
 * signature. This asserts, in a real browser with the real font, that:
 *
 *   1. both variants still fit the Figma line count (2)
 *   2. neither overflows the frame
 *   3. the campaign line stays on one line
 *
 *   npm run check:copy
 */
import { chromium } from "playwright";

import { DYNAMIC_TEXT, FRAME, QR } from "../src/lib/cert-template.ts";
import { copyFor } from "../src/lib/gender-text.ts";

const BASE = process.env.INTERNAL_BASE_URL ?? "http://127.0.0.1:3000";
const FONT_STACK = 'var(--font-ibm-plex-arabic), "IBM Plex Sans Arabic", sans-serif';
const failures: string[] = [];

function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();

  // Load once from the app so @font-face is registered with the real family.
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
  await page.evaluate("document.fonts.ready");

  const config = {
    variants: { male: copyFor("male"), female: copyFor("female") },
  };

  const result = (await page.evaluate((cfg: any) => {
    const out: Record<string, unknown> = {};

    for (const [gender, copy] of Object.entries<any>(cfg.variants)) {
      // Body paragraph
      const desc = document.createElement("div");
      desc.style.cssText = [
        "position:absolute", "visibility:hidden", "direction:rtl", "text-align:center",
        "margin:0", "padding:0",
        "font-family:" + cfg.description.fontFamily,
        "font-size:" + cfg.description.fontSize + "px",
        "font-weight:" + cfg.description.weight,
        "line-height:" + cfg.description.lineHeight + "px",
        "letter-spacing:0",
        "width:" + cfg.description.width + "px",
      ].join(";");
      document.body.appendChild(desc);
      desc.textContent = copy.description;
      const descBox = desc.getBoundingClientRect();
      const descLines = Math.round(descBox.height / cfg.description.lineHeight);
      const descBottom = cfg.description.y + descBox.height;

      // Campaign line. Mirrors slotStyle() in certificate.tsx: a box of width
      // 2 * center pinned to x=0 has its midpoint exactly on `center`, and the
      // frame clips the overflow.
      const line = document.createElement("div");
      line.style.cssText = [
        "position:absolute", "visibility:hidden", "direction:rtl", "text-align:center",
        "margin:0", "padding:0", "box-sizing:border-box",
        "font-family:" + cfg.contributed.fontFamily,
        "font-size:" + cfg.contributed.fontSize + "px",
        "font-weight:" + cfg.contributed.weight,
        "line-height:" + cfg.contributed.lineHeight + "px",
        "letter-spacing:0",
        "width:" + cfg.contributed.boxWidth + "px",
      ].join(";");
      document.body.appendChild(line);
      line.textContent = copy.contributed;
      const lineBox = line.getBoundingClientRect();

      desc.remove();
      line.remove();

      out[gender] = {
        descLines,
        descBottom,
        descScrollWidth: desc.scrollWidth,
        lineLines: Math.round(lineBox.height / cfg.contributed.lineHeight),
        lineScrollWidth: line.scrollWidth,
        lineWidth: cfg.contributed.boxWidth,
      };
    }
    return out;
  }, {
    ...config,
    description: {
      x: DYNAMIC_TEXT.description.x,
      y: DYNAMIC_TEXT.description.y,
      width: DYNAMIC_TEXT.description.width,
      fontSize: DYNAMIC_TEXT.description.fontSize,
      weight: DYNAMIC_TEXT.description.weight,
      lineHeight: DYNAMIC_TEXT.description.lineHeight,
      fontFamily: FONT_STACK,
    },
    contributed: {
      // slotStyle(): width = center * 2, minus maxWidth padding on each side.
      boxWidth:
        (DYNAMIC_TEXT.contributed.center ?? DYNAMIC_TEXT.contributed.width / 2) * 2 -
        (("maxWidth" in DYNAMIC_TEXT.contributed ? DYNAMIC_TEXT.contributed.maxWidth : 0) as number),
      fontSize: DYNAMIC_TEXT.contributed.fontSize,
      weight: DYNAMIC_TEXT.contributed.weight,
      lineHeight: DYNAMIC_TEXT.contributed.lineHeight,
      fontFamily: FONT_STACK,
    },
  })) as Record<string, { descLines: number; descBottom: number; lineLines: number; lineScrollWidth: number; lineWidth: number }>;

  console.log(`\ncopy check — box ${DYNAMIC_TEXT.description.width}px, ${FRAME.width - 2 * DYNAMIC_TEXT.description.x - 0}px frame\n`);

  // Invariant: «لوجهه الكريم» refers to الله, so it must be identical in both
  // variants. This is the easiest thing to "correct" by mistake, so assert it.
  const maleCopy = copyFor("male").description;
  const femaleCopy = copyFor("female").description;
  check(
    maleCopy.includes("لوجهه الكريم") && femaleCopy.includes("لوجهه الكريم"),
    "«لوجهه الكريم» is masculine in BOTH variants (refers to الله)",
  );
  check(
    !femaleCopy.includes("لوجهها"),
    "feminine variant does not say لوجهها",
  );
  // The parts that must differ.
  for (const [from, to] of [
    ["لجهوده", "لجهودها"],
    ["ومساهمته", "ومساهمتها"],
    ["أثره", "أثرها"],
    ["عمله", "عملها"],
  ] as const) {
    check(
      maleCopy.includes(from) && femaleCopy.includes(to),
      `feminine uses ${to} for ${from}`,
    );
  }
  check(
    copyFor("male").contributed === "قد ساهم في حملة" &&
      copyFor("female").contributed === "قد ساهمت في حملة",
    "campaign line conjugates (ساهم / ساهمت)",
  );

  for (const [gender, data] of Object.entries(result)) {
    check(data.descLines === 2, `${gender}: paragraph is 2 lines`, `got ${data.descLines}`);
    check(
      data.descBottom < 1003,
      `${gender}: paragraph clears the signature (y=1003)`,
      `bottom at ${Math.round(data.descBottom)}`,
    );
    check(data.lineLines === 1, `${gender}: campaign line is 1 line`, `got ${data.lineLines}`);
    check(
      data.lineScrollWidth <= data.lineWidth,
      `${gender}: campaign line does not overflow its box`,
      `${data.lineScrollWidth} <= ${data.lineWidth}`,
    );
  }

  // The QR must not be covered by the paragraph.
  check(
    DYNAMIC_TEXT.description.y + 2 * DYNAMIC_TEXT.description.lineHeight < QR.y,
    "paragraph (2 lines) sits above the QR",
    `${DYNAMIC_TEXT.description.y + 2 * DYNAMIC_TEXT.description.lineHeight} < ${QR.y}`,
  );

  await browser.close();

  console.log();
  if (failures.length) {
    console.log(`${failures.length} copy check(s) FAILED — see src/lib/cert-template.ts`);
    process.exitCode = 1;
  } else {
    console.log("All copy checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
