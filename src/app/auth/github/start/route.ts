import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GITHUB_STATE_COOKIE } from "@/lib/auth";
import { authorizeUrl, githubConfigured } from "@/lib/github";

export const dynamic = "force-dynamic";

/**
 * Kicks off GitHub OAuth.
 *
 * A random `state` is stored in a short-lived cookie and compared on the way
 * back, so a third party cannot feed us an authorization code.
 */
export async function GET(request: Request) {
  if (!githubConfigured()) {
    return NextResponse.redirect(new URL("/login?github=not-configured", request.url));
  }

  const state = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(state));
}
