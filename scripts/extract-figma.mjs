#!/usr/bin/env node
/**
 * Re-extracts the certificate template from Figma.
 *
 *   FIGMA_TOKEN=figd_… npm run figma:sync
 *
 * Reads node 7:284 ("Frame 3") from the design file, writes the artwork to
 * public/cert/ as vector SVG, and prints the text-layer geometry as JSON so
 * src/lib/cert-template.ts can be diffed against the current design.
 *
 * The token only needs `file_content:read` on this one file. Nothing at runtime
 * talks to Figma — this script is a build-time tool, so the token can be
 * revoked the moment the assets are committed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const FILE_KEY = process.env.FIGMA_FILE_KEY ?? "uwzIOEMK4EQ3sGfvSlzJu0";
const FRAME_ID = process.env.FIGMA_FRAME_ID ?? "7:284";
const TOKEN = process.env.FIGMA_TOKEN;

if (!TOKEN) {
  console.error("FIGMA_TOKEN is required. Create one at Figma → Settings → Security → Personal access tokens.");
  process.exit(1);
}

const API = "https://api.figma.com/v1";
const OUT_DIR = resolve("public/cert");

/** node id -> output file name */
const ASSETS = {
  "7:297": "border.svg",
  "7:701": "logos-top.svg",
  "3:70": "title.svg",
  "7:404": "divider-name.svg",
  "8:742": "campaign.svg",
  "37:26": "icon-file.svg",
  "37:21": "icon-calendar.svg",
};

async function figma(path) {
  const response = await fetch(`${API}${path}`, { headers: { "X-Figma-Token": TOKEN } });
  if (!response.ok) {
    throw new Error(`Figma API ${response.status} on ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${destination}`);
  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, body);
  return body.byteLength;
}

function collectText(node, frameBox, out) {
  const box = node.absoluteBoundingBox;
  if (node.type === "TEXT" && box) {
    const hex = (node.fills ?? [])
      .filter((fill) => fill.type === "SOLID" && fill.visible !== false)
      .map((fill) =>
        "#" +
        [fill.color.r, fill.color.g, fill.color.b]
          .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
          .join(""),
      )
      .join(",");
    out.push({
      id: node.id,
      characters: node.characters,
      x: +(box.x - frameBox.x).toFixed(2),
      y: +(box.y - frameBox.y).toFixed(2),
      width: +box.width.toFixed(2),
      height: +box.height.toFixed(2),
      fontFamily: node.style.fontFamily,
      fontWeight: node.style.fontWeight,
      fontSize: node.style.fontSize,
      lineHeightPx: node.style.lineHeightPx,
      letterSpacing: node.style.letterSpacing,
      align: node.style.textAlignHorizontal,
      verticalAlign: node.style.textAlignVertical,
      textAutoResize: node.style.textAutoResize,
      fills: hex,
    });
  }
  for (const child of node.children ?? []) collectText(child, frameBox, out);
}

async function main() {
  console.log(`Reading ${FILE_KEY} node ${FRAME_ID} …`);
  const { nodes } = await figma(
    `/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(FRAME_ID)}&geometry=paths`,
  );
  const frame = nodes[FRAME_ID]?.document;
  if (!frame) throw new Error(`Node ${FRAME_ID} not found in the file`);

  const frameBox = frame.absoluteBoundingBox;
  console.log(`Frame "${frame.name}" — ${frameBox.width} x ${frameBox.height}`);

  // --- artwork -------------------------------------------------------
  const ids = Object.keys(ASSETS).join(",");
  console.log(`\nRequesting ${Object.keys(ASSETS).length} SVG export(s) …`);
  const { images } = await figma(`/images/${FILE_KEY}?ids=${ids}&format=svg&svg_include_id=false`);

  await mkdir(OUT_DIR, { recursive: true });
  for (const [id, file] of Object.entries(ASSETS)) {
    const url = images[id];
    if (!url) {
      console.warn(`  ! ${id} -> ${file}: Figma returned no URL (node may have been deleted)`);
      continue;
    }
    const bytes = await download(url, resolve(OUT_DIR, file));
    console.log(`  ✓ ${file.padEnd(22)} ${(bytes / 1024).toFixed(1)} KB`);
  }

  // --- signature (raster, referenced by image fill) -------------------
  const imagesInFrame = new Set();
  const walk = (node) => {
    for (const fill of node.fills ?? []) if (fill.type === "IMAGE") imagesInFrame.add(fill.imageRef);
    for (const child of node.children ?? []) walk(child);
  };
  walk(frame);
  console.log(`\nImage fills in frame: ${[...imagesInFrame].join(", ") || "(none)"}`);
  console.log("  -> export the signature by hand from Figma if it is not signature.png");

  // --- text geometry -------------------------------------------------
  const textLayers = [];
  collectText(frame, frameBox, textLayers);

  const geometryPath = resolve("assets/_figma-raw/text-geometry.json");
  await mkdir(dirname(geometryPath), { recursive: true });
  await writeFile(geometryPath, JSON.stringify({ frame: frameBox, textLayers }, null, 2));

  // Refresh the small fixture that scripts/check-assets.ts validates against.
  // Only the exported nodes are kept; the full tree is several megabytes.
  const EXPORTED = {
    "7:297": "border",
    "7:701": "logosTop",
    "3:70": "title",
    "7:404": "dividerName",
    "7:730": "campaignLogo",
    "37:26": "iconFile",
    "37:21": "iconCalendar",
    "37:57": "signature",
  };
  const findById = (node, id) => {
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const hit = findById(child, id);
      if (hit) return hit;
    }
    return null;
  };
  const rel = (b) => ({
    x: Number((b.x - frameBox.x).toFixed(2)),
    y: Number((b.y - frameBox.y).toFixed(2)),
    width: Number(b.width.toFixed(2)),
    height: Number(b.height.toFixed(2)),
  });

  const fixtureAssets = {};
  for (const [id, key] of Object.entries(EXPORTED)) {
    const node = findById(frame, id);
    if (!node) {
      console.warn(`  ! ${key}: node ${id} not found — remove it from EXPORTED`);
      continue;
    }
    fixtureAssets[key] = { nodeId: id, name: node.name, type: node.type, box: rel(node.absoluteBoundingBox) };
  }

  const fixture = {
    _comment:
      "Geometry of the certificate artwork, captured from Figma node 7:284 (Frame 3). Consumed by scripts/check-assets.ts to verify src/lib/cert-template.ts. Regenerate with: FIGMA_TOKEN=... npm run figma:sync",
    file: `https://www.figma.com/design/${FILE_KEY}`,
    frame: { nodeId: FRAME_ID, name: frame.name, width: frameBox.width, height: frameBox.height },
    assets: fixtureAssets,
  };
  if (frame.fills?.[0]?.type === "GRADIENT_LINEAR") {
    const g = frame.fills[0];
    fixture.backgroundGradient = {
      type: g.type,
      handles: g.gradientHandlePositions.map((h) => [h.x, h.y]),
      stops: g.gradientStops.map((s) => ({
        position: s.position,
        color: "#" + [s.color.r, s.color.g, s.color.b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""),
      })),
      _note: "Lives on the frame's own fill, not on any child layer.",
    };
  }
  const fixturePath = resolve("assets/figma-geometry.json");
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`\nWrote ${fixturePath}`);

  console.log(`\nText layers (${textLayers.length}) — frame-relative:`);
  console.log(
    ["id", "y", "x", "w", "font", "wt", "size", "lh", "align", "text"].join("\t"),
  );
  for (const layer of textLayers) {
    console.log(
      [
        layer.id,
        layer.y,
        layer.x,
        layer.width,
        layer.fontFamily,
        layer.fontWeight,
        layer.fontSize,
        layer.lineHeightPx,
        layer.align,
        layer.characters.slice(0, 30),
      ].join("\t"),
    );
  }

  console.log(`\nWrote ${geometryPath}`);
  console.log("Next: diff the numbers above against src/lib/cert-template.ts and update any that moved.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
