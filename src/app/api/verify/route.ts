import { NextResponse } from "next/server";

import { verify } from "@/lib/verify";

/**
 * Public certificate lookup.
 *
 * Returns the certificate details for a code. Nothing is recorded — no attempt
 * log, no rate-limit state.
 */
export async function POST(request: Request) {
  let input = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    input = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ outcome: "not_found" }, { status: 400 });
  }

  return NextResponse.json(verify(input), {
    headers: { "Cache-Control": "no-store" },
  });
}
