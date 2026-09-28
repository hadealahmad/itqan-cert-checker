/**
 * Pure session primitives — no `next/headers`, no request context.
 *
 * Kept separate from session.ts so client components can import a server
 * action that in turn imports this file without dragging the request-only
 * `next/headers` API into the browser bundle.
 */

import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "itqan_admin";
export const PARTICIPANT_COOKIE = "itqan_participant";
export const GITHUB_STATE_COOKIE = "itqan_gh_state";

const ADMIN_TTL = 60 * 60 * 12; // 12h
const PARTICIPANT_TTL = 60 * 60 * 24 * 30; // 30d

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be set (see .env.example)");
  }
  return new TextEncoder().encode(value);
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export const ADMIN_COOKIE_MAX_AGE = ADMIN_TTL;
export const PARTICIPANT_COOKIE_MAX_AGE = PARTICIPANT_TTL;

/* ------------------------------------------------------------------ *
 * Admin — a single password from the environment
 * ------------------------------------------------------------------ */

export function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD must be set (see .env.example)");
  return safeEqual(candidate, expected);
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL}s`)
    .sign(secret());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Participants — identified by user id after a GitHub eligibility check
 * ------------------------------------------------------------------ */

export interface ParticipantSession {
  userId: number;
  githubLogin: string;
}

export async function createParticipantToken(payload: ParticipantSession): Promise<string> {
  return new SignJWT({ role: "participant", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PARTICIPANT_TTL}s`)
    .sign(secret());
}

export async function verifyParticipantToken(
  token: string | undefined,
): Promise<ParticipantSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "participant") return null;
    return { userId: Number(payload.userId), githubLogin: String(payload.githubLogin) };
  } catch {
    return null;
  }
}
