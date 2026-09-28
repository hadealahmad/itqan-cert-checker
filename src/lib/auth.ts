import { cookies } from "next/headers";

import { SignJWT, jwtVerify } from "jose";

const COOKIE = "itqan_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be set (see .env.example)");
  }
  return new TextEncoder().encode(value);
}

/** Constant-time-ish comparison that does not leak length via early exit. */
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

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE)?.value);
}

/** For route handlers: returns true when a valid admin session is present. */
export async function requireAdmin(): Promise<boolean> {
  return isAuthenticated();
}

export const sessionCookie = {
  name: COOKIE,
  maxAge: MAX_AGE_SECONDS,
};
