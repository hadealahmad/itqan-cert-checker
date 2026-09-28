/**
 * Verifies the template's geometry against the Figma file.
 *
 * Two classes of mistake are checked:
 *
 *   1. An asset box in src/lib/cert-template.ts that no longer matches the node
 *      it came from. This happened once: campaignLogo's height was copied from
 *      a *child* node (92) instead of the group itself (107.8), which clipped
 *      the bottom of «يخدم القرآن» off the logo.
 *   2. An exported SVG whose viewBox no longer matches the box it is placed at,
 *      which squashes or crops the artwork.
 *
 * Runs entirely offline against assets/figma-geometry.json, which is committed —
 * no Figma token needed.
 *
 *   npm run check:assets
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const GEOMETRY = resolve("assets/figma-geometry.json");
const TEMPLATE = resolve("src/lib/cert-template.ts");
const TOLERANCE = 0.6;

const failures: string[] = [];

function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pull `key: { src, x, y, width, height }` entries out of the ASSETS object. */
function parseAssets(source: string): Record<string, Box & { src: string }> {
  const block = /export const ASSETS = \{([\s\S]*?)\n\} satisfies/.exec(source)?.[1] ?? "";
  const out: Record<string, Box & { src: string }> = {};
  const entry = /(\w+):\s*\{([^}]*)\}/g;
  for (const match of block.matchAll(entry)) {
    const key = match[1]!;
    const body = match[2]!;
    const num = (name: string) => {
      const m = new RegExp(`${name}:\\s*([\\d.]+)`).exec(body);
      return m ? Number(m[1]) : NaN;
    };
    const src = /src:\s*"([^"]+)"/.exec(body)?.[1] ?? "";
    if (src) out[key] = { src, x: num("x"), y: num("y"), width: num("width"), height: num("height") };
  }
  return out;
}

async function main() {
  const geometry = JSON.parse(await readFile(GEOMETRY, "utf8"));
  const source = await readFile(TEMPLATE, "utf8");

  const assets = parseAssets(source);
  const keys = Object.keys(assets);

  console.log(
    `\nasset boxes vs Figma node ${geometry.frame.nodeId} (frame ${geometry.frame.width}x${geometry.frame.height})\n`,
  );

  for (const key of keys) {
    const asset = assets[key]!;
    const entry = geometry.assets[key];
    if (!entry) {
      check(false, `${key}: not present in the geometry fixture`);
      continue;
    }
    const truth: Box = entry.box;
    const ok =
      Math.abs(asset.x - truth.x) <= TOLERANCE &&
      Math.abs(asset.y - truth.y) <= TOLERANCE &&
      Math.abs(asset.width - truth.width) <= TOLERANCE &&
      Math.abs(asset.height - truth.height) <= TOLERANCE;
    check(
      ok,
      `${key} matches node ${entry.nodeId}`,
      ok
        ? `${asset.width}x${asset.height} @ ${asset.x},${asset.y}  (node ${entry.nodeId})`
        : `template ${asset.width}x${asset.height} @ ${asset.x},${asset.y} vs figma ${truth.width.toFixed(1)}x${truth.height.toFixed(1)} @ ${truth.x.toFixed(1)},${truth.y.toFixed(1)}`,
    );
  }

  // Every exported SVG must declare a viewBox matching the box it is placed at.
  console.log("\nsvg viewBox vs the box it is placed at\n");
  for (const key of keys) {
    const asset = assets[key]!;
    if (!asset.src.endsWith(".svg")) continue;
    const svg = await readFile(resolve("public", asset.src.replace(/^\//, "")), "utf8").catch(() => null);
    if (!svg) {
      check(false, `${key}: ${asset.src} is missing`);
      continue;
    }
    const m = /viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/.exec(svg);
    if (!m) {
      check(false, `${key}: no viewBox`);
      continue;
    }
    const vw = Number(m[3]);
    const vh = Number(m[4]);
    const ok = Math.abs(vw - asset.width) <= TOLERANCE && Math.abs(vh - asset.height) <= TOLERANCE;
    check(
      ok,
      `${key} svg viewBox matches`,
      ok ? `${vw}x${vh}` : `svg ${vw}x${vh} vs placed at ${asset.width}x${asset.height}`,
    );
  }

  console.log();
  if (failures.length) {
    console.log(`${failures.length} asset check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`All ${keys.length} assets consistent with the Figma file.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
