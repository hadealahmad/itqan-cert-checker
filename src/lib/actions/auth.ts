"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { LoginState } from "@/lib/action-state";
import { ADMIN_COOKIE, checkPassword, cookieOptions, createAdminToken, ADMIN_COOKIE_MAX_AGE } from "@/lib/auth";

/**
 * `next/headers` is used here directly rather than through a helper module:
 * a "use server" file imported by a client component must not reach the
 * request-only API transitively, or webpack pulls it into the browser graph.
 * The pure JWT/password helpers live in lib/auth.ts.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!password) return { error: "الرجاء إدخال كلمة المرور" };
  if (!checkPassword(password)) {
    // Vague on purpose; no artificial delay, since that would only tell an
    // attacker how long a wrong guess took.
    return { error: "كلمة المرور غير صحيحة" };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, await createAdminToken(), cookieOptions(ADMIN_COOKIE_MAX_AGE));

  redirect("/admin");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/login");
}
