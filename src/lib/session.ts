/**
 * Cookie-backed session access. Server-only — imports `next/headers`, so it
 * must never be pulled into a client bundle.
 */

import { cookies } from "next/headers";

import {
  ADMIN_COOKIE,
  PARTICIPANT_COOKIE,
  cookieOptions,
  createAdminToken,
  createParticipantToken,
  verifyAdminToken,
  verifyParticipantToken,
  ADMIN_COOKIE_MAX_AGE,
  PARTICIPANT_COOKIE_MAX_AGE,
  type ParticipantSession,
} from "./auth";

/* --------------------------- admin --------------------------- */

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

/** For route handlers: true when a valid admin session is present. */
export async function requireAdmin(): Promise<boolean> {
  return isAuthenticated();
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, await createAdminToken(), cookieOptions(ADMIN_COOKIE_MAX_AGE));
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/* ------------------------ participant ------------------------ */

export async function setParticipantSession(payload: ParticipantSession): Promise<void> {
  const store = await cookies();
  store.set(
    PARTICIPANT_COOKIE,
    await createParticipantToken(payload),
    cookieOptions(PARTICIPANT_COOKIE_MAX_AGE),
  );
}

export async function clearParticipantSession(): Promise<void> {
  const store = await cookies();
  store.delete(PARTICIPANT_COOKIE);
}

/** The signed-in participant, or null. */
export async function currentParticipant(): Promise<ParticipantSession | null> {
  const store = await cookies();
  return verifyParticipantToken(store.get(PARTICIPANT_COOKIE)?.value);
}
