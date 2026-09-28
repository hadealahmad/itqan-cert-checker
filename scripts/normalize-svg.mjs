#!/usr/bin/env node
/**
 * Crop Figma-exported SVGs so their viewBox matches the node they came from.
 *
 * Figma exports a region larger than the node so that layer effects (shadows,
 * blurs) are not clipped, so the viewBox is usually bigger than the node. Placing
 * the file at the node's size then squashes the artwork.
 *
 * The padding is NOT symmetric — it grows only where an effect reaches — so the
 * offset has to be measured rather than guessed. This renders the SVG and finds
 * the top-left of the actual ink, which for design artwork is flush with the
 * node's top-left corner.
 *
 *   node scripts/normalize-svg.mjs <file.svg> <nodeWidth> <nodeHeight> [...]
 *
 * Node bounds come from assets/_figma-raw/text-geometry.json and the coordinates
 * recorded in src/lib/cert-template.ts.
 */
import { readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

/** Treat anything lighter than this as background. */
const INK_THRESHOLD = 245;
/** Ignore single stray pixels from antialiasing. */
const MIN_INK = 4;

async function inkOrigin(svg, viewBoxWidth, viewBoxHeight) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .flatten({ background: "#ffffff" })
    .resize(Math.ceil(viewBoxWidth), Math.ceil(viewBoxHeight), { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = Infinity;
  let minY = Infinity;
  let inked = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels] < INK_THRESHOLD) {
        inked++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
    }
  }

  if (inked < MIN_INK) throw new Error("no ink found — is the SVG empty?");
  return { x: minX, y: minY };
}

/**
 * Files carry a marker once normalised. Without it the script is not
 * idempotent: re-running would measure the ink origin relative to the *already
 * cropped* viewBox and crop the artwork a second time.
 */
const MARKER = "cert-template:normalized";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 3 !== 0) {
  console.error("usage: normalize-svg.mjs <file.svg> <w> <h> [<file.svg> <w> <h> …]");
  process.exit(1);
}

for (let index = 0; index < args.length; index += 3) {
  const file = args[index];
  const width = Number(args[index + 1]);
  const height = Number(args[index + 2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    console.error(`${file}: bad node size`);
    continue;
  }

  let svg = await readFile(file, "utf8");

  if (svg.includes(MARKER)) {
    const m = new RegExp(`${MARKER} (\\d+(?:\\.\\d+)?)x(\\d+(?:\\.\\d+)?)`).exec(svg);
    console.log(`${file}: already normalised${m ? ` to ${m[1]}×${m[2]}` : ""} — skipped`);
    continue;
  }

  const match = /viewBox="([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+)"/.exec(svg);
  if (!match) {
    console.log(`${file}: no viewBox, skipped`);
    continue;
  }

  // A root with two width/height pairs is invalid XML and will not rasterise.
  const rootTag = /<svg[^>]*>/.exec(svg)?.[0] ?? "";
  if ((rootTag.match(/\bwidth="/g)?.length ?? 0) > 1) {
    console.error(`${file}: duplicate width/height on <svg> — repair before normalising`);
    continue;
  }

  const vw = Number(match[3]);
  const vh = Number(match[4]);

  let origin;
  try {
    origin = await inkOrigin(svg, vw, vh);
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    continue;
  }

  const round = (n) => Number(n.toFixed(4));

  /**
   * Rewrite the root element's geometry. The original width/height have to be
   * removed first, otherwise the file ends up with duplicate attributes and
   * browsers reject the whole SVG.
   */
  const rewrite = (viewBox) =>
    `<!-- ${MARKER} ${round(width)}x${round(height)} -->\n` +
    svg
      .replace(/^\s*<!--[\s\S]*?-->\s*/, "")
      .replace(/^<svg\s+width="[\d.]+"\s+height="[\d.]+"\s+/, "<svg ")
      .replace(
        /viewBox="[\d.eE+-]+ [\d.eE+-]+ [\d.eE+-]+ [\d.eE+-]+"/,
        `width="${round(width)}" height="${round(height)}" viewBox="${viewBox}"`,
      );

  if (Math.abs(origin.x) < 0.5 && Math.abs(origin.y) < 0.5) {
    await writeFile(file, rewrite(`0 0 ${round(width)} ${round(height)}`));
    console.log(`${file}: ink already flush at 0,0 — pinned to ${round(width)}×${round(height)}`);
    continue;
  }

  await writeFile(file, rewrite(`${round(origin.x)} ${round(origin.y)} ${round(width)} ${round(height)}`));
  console.log(
    `${file}: viewBox ${vw}×${vh} → ${round(width)}×${round(height)} at ink origin (${round(origin.x)}, ${round(origin.y)})`,
  );
}
