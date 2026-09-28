import QRCode from "qrcode";

import { QR as DEFAULT_QR } from "./cert-template";

/** Public origin used to build scannable links, e.g. https://itqan.dev */
export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Origin the render worker should load the print route from.
 *
 * Deliberately separate from the public origin: the worker runs on the same
 * host as the app, so talking to 127.0.0.1 avoids depending on DNS, TLS and any
 * firewall between the app and the internet. Set INTERNAL_BASE_URL only when
 * the worker genuinely lives elsewhere.
 */
export function internalBaseUrl(): string {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL.replace(/\/+$/, "");
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

/**
 * Scannable/clickable target: the single verification page, with the code
 * deep-linked so it checks itself on arrival. Kept terse on purpose — see
 * QR.margin in cert-template.
 */
export function verifyPath(code: string): string {
  return `${baseUrl()}/?code=${code}`;
}

export function verifyUrl(code: string): string {
  return verifyPath(code);
}

/**
 * Render the QR as an inline SVG string, ready to drop into the certificate.
 * The sizing/correction config comes from the template being rendered.
 */
export async function qrSvg(
  code: string,
  config: { size: number; margin: number; errorCorrectionLevel: "L" | "M" | "Q" | "H" } = DEFAULT_QR,
): Promise<string> {
  return QRCode.toString(verifyPath(code), {
    type: "svg",
    errorCorrectionLevel: config.errorCorrectionLevel,
    margin: config.margin,
    width: config.size,
    color: { dark: "#014B3FFF", light: "#00000000" },
  });
}
