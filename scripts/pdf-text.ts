/**
 * Extracts text from a generated certificate PDF.
 *
 * Chromium writes Identity-H encoded text, so the glyph ids in the content
 * stream are not the code points — reversing them properly means parsing the
 * PDF's ToUnicode CMap. `pdftotext` (poppler-utils) already does that, so the
 * smoke test shells out to it rather than reimplementing a PDF parser.
 *
 * Test-only helper; not part of the app.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

let available: boolean | undefined;

export async function pdfTextAvailable(): Promise<boolean> {
  if (available !== undefined) return available;
  try {
    await run("pdftotext", ["-v"]);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export async function extractPdfText(path: string): Promise<string> {
  const { stdout } = await run("pdftotext", ["-enc", "UTF-8", path, "-"], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}
