import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import archiver from "archiver";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { listCertificates } from "@/lib/certs";
import { renderCertificate } from "@/lib/render";

export const dynamic = "force-dynamic";

/**
 * Stream every certificate as a ZIP.
 *
 *   POST /api/admin/certs/archive?status=issued|png
 *
 * `status=issued` (default) leaves out revoked certificates, which is usually
 * what you want when handing files out. `format=png` includes images alongside
 * the PDFs.
 */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeRevoked = url.searchParams.get("status") === "all";
  const includePng = url.searchParams.get("format") === "png";

  const rows = listCertificates({ status: includeRevoked ? "all" : "issued", limit: 2000 });
  if (rows.length === 0) {
    return NextResponse.json({ error: "nothing to archive" }, { status: 404 });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  const finished = new Promise<void>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", resolve);
    archive.on("warning", reject);
    archive.on("error", reject);
  });

  let added = 0;
  for (const row of rows) {
    const safeName = row.recipientName.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    try {
      const files = await renderCertificate(row.id);
      archive.append(createReadStream(files.pdf), { name: `${safeName} (${row.code}).pdf` });
      added++;
      if (includePng) {
        archive.append(createReadStream(files.png), { name: `${safeName} (${row.code}).png` });
      }
    } catch {
      // Skip anything that will not render rather than failing the whole batch.
      continue;
    }
  }

  if (added === 0) {
    return NextResponse.json({ error: "nothing rendered" }, { status: 500 });
  }

  await archive.finalize();
  await finished;

  const body = Buffer.concat(chunks);
  const filename = `certificates-${new Date().toISOString().slice(0, 10)}.zip`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
