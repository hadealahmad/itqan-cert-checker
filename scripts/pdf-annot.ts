/**
 * Reads the URI link annotations out of a generated PDF.
 *
 * Chromium's print-to-PDF turns an HTML <a href> into a real /Link annotation,
 * so this is how the smoke test proves the certificate's QR code is clickable.
 *
 * Deliberately not a PDF parser. Skia's annotation dictionary looks like
 *
 *   <</S /URI
 *   /URI (https://…)
 *   >>
 *
 * — the action name appears twice, split by a newline — so this scans for the
 * first parenthesised string after any /URI token and keeps the URL-shaped ones.
 */
import { readFile } from "node:fs/promises";

export async function hasLinkAnnots(path: string): Promise<boolean> {
  const raw = (await readFile(path)).toString("latin1");
  return /\/Subtype\s*\/Link/.test(raw);
}

/** Target URI of every link annotation, de-duplicated, in document order. */
export async function extractPdfAnnots(path: string): Promise<string[]> {
  const raw = (await readFile(path)).toString("latin1");

  const found: string[] = [];
  for (const match of raw.matchAll(/\/URI/g)) {
    const open = raw.indexOf("(", match.index);
    if (open === -1) continue;
    const close = raw.indexOf(")", open);
    if (close === -1) continue;
    const value = raw.slice(open + 1, close).trim();
    if (/^https?:\/\//i.test(value) && !found.includes(value)) found.push(value);
  }
  return found;
}
