import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getCertificateById } from "@/lib/certs";
import { contentDisposition } from "@/lib/content-disposition";
import { renderCertificate } from "@/lib/render";

export const dynamic = "force-dynamic";

const MIME = { pdf: "application/pdf", png: "image/png" } as const;
type Format = keyof typeof MIME;

function deny() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Download a single certificate as PDF or PNG. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return deny();

  const { id } = await params;
  const cert = getCertificateById(Number(id));
  if (!cert) return NextResponse.json({ error: "not found" }, { status: 404 });

  const format: Format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "pdf";

  let path: string;
  try {
    const files = await renderCertificate(cert.id);
    path = format === "pdf" ? files.pdf : files.png;
  } catch {
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }

  const info = await stat(path).catch(() => null);
  if (!info) return NextResponse.json({ error: "missing" }, { status: 404 });

  const filename = `certificate-${cert.code}.${format}`;

  return new NextResponse(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Length": String(info.size),
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}
