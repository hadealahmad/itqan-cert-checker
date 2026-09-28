import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { chromium, type Browser } from "playwright";

import { FRAME } from "./cert-template";
import { getCertificateById } from "./certs";
import { internalBaseUrl } from "./qr";

const STORAGE = resolve(process.cwd(), "storage/certs");

/** Chromium is heavy; keep exactly one around and reuse it. */
const globalForBrowser = globalThis as unknown as { __pwBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  if (!globalForBrowser.__pwBrowser) {
    globalForBrowser.__pwBrowser = chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });
  }
  return globalForBrowser.__pwBrowser;
}

export interface RenderedFiles {
  pdf: string;
  png: string;
}

/** Serialise renders — Chromium will happily eat every core otherwise. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function storagePath(code: string, ext: "pdf" | "png"): string {
  return join(STORAGE, `${code}.${ext}`);
}

async function capture(certId: number): Promise<RenderedFiles> {
  const cert = getCertificateById(certId);
  if (!cert) throw new Error("Certificate not found");

  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: FRAME.width, height: FRAME.height },
    deviceScaleFactor: 2,
  });

  try {
    const url = `${internalBaseUrl()}/p/${cert.printToken}`;
    // "load" rather than "networkidle": the dev server holds an HMR websocket
    // open, which would keep networkidle from ever settling.
    const response = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`Print page returned ${response?.status()}`);

    // Chromium will happily lay out with a fallback face if the webfont is slow.
    await page.evaluate("document.fonts.ready");
    await page.waitForTimeout(150);

    const pdf = storagePath(cert.code, "pdf");
    const png = storagePath(cert.code, "png");
    await mkdir(dirname(pdf), { recursive: true });

    await page.pdf({
      path: pdf,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    // Explicit clip rather than element.screenshot(): an element screenshot
    // blocks until the node is "stable", which never happens for a wrapper
    // that Next.js re-renders.
    await page.screenshot({
      path: png,
      clip: { x: 0, y: 0, width: FRAME.width, height: FRAME.height },
      animations: "disabled",
      timeout: 20_000,
    });

    return { pdf, png };
  } finally {
    await page.close();
  }
}

/**
 * Render one certificate to PDF + PNG, caching on disk.
 *
 * This is only ever called from a download route, so a certificate is not
 * produced until someone actually asks for it. A second call for the same code
 * is a no-op once both files exist.
 */
export function renderCertificate(certId: number, force = false) {
  return enqueue(async () => {
    const cert = getCertificateById(certId);
    if (!cert) throw new Error("Certificate not found");

    const pdf = storagePath(cert.code, "pdf");
    const png = storagePath(cert.code, "png");

    if (!force) {
      const hasBoth = await hasRenderedFiles(cert.code);
      if (hasBoth) return { pdf, png };
    }

    return capture(certId);
  });
}

/** True when both the PDF and the PNG are already on disk. */
export async function hasRenderedFiles(code: string): Promise<boolean> {
  const [pdf, png] = await Promise.all([
    readFile(storagePath(code, "pdf")).then(() => true, () => false),
    readFile(storagePath(code, "png")).then(() => true, () => false),
  ]);
  return pdf && png;
}

export async function deleteRenderedFiles(code: string): Promise<void> {
  await Promise.all([
    rm(storagePath(code, "pdf"), { force: true }),
    rm(storagePath(code, "png"), { force: true }),
  ]);
}

