import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCertificateByPrintToken } from "@/lib/certs";
import { contentDisposition } from "@/lib/content-disposition";
import { renderCertificate } from "@/lib/render";

export const dynamic = "force-dynamic";

const MIME = {
  pdf: { type: "application/pdf", ext: "pdf" },
  png: { type: "image/png", ext: "png" },
} as const;

type Format = keyof typeof MIME;

/**
 * Public download for a certificate holder.
 *
 * Gated on the unguessable print token rather than the 8-digit code, so
 * certificates cannot be enumerated or bulk-downloaded by guessing. The file is
 * rendered on first request and cached afterwards.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cert = getCertificateByPrintToken(token);
  if (!cert) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(request.url);
  const requested = url.searchParams.get("format") === "png" ? "png" : "pdf";
  const format: Format = requested;

  let path: string;
  try {
    const files = await renderCertificate(cert.id);
    path = format === "pdf" ? files.pdf : files.png;
  } catch {
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }

  const info = await stat(path).catch(() => null);
  if (!info) return NextResponse.json({ error: "missing" }, { status: 404 });

  const downloadName = `${cert.recipientName} - ${cert.code}.${MIME[format].ext}`;

  return new NextResponse(createReadStream(path) as unknown as ReadableStream, {
    headers: {
      "Content-Type": MIME[format].type,
      "Content-Length": String(info.size),
      "Content-Disposition": contentDisposition(downloadName),
      "Cache-Control": "private, max-age=300",
    },
  });
}
