"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { LoginState } from "@/lib/action-state";
import { checkPassword, createSessionToken, sessionCookie } from "@/lib/auth";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!password) return { error: "الرجاء إدخال كلمة المرور" };

  if (!checkPassword(password)) {
    // Deliberately vague, and no artificial delay — a timing side channel here
    // would only tell an attacker how long a wrong guess took.
    return { error: "كلمة المرور غير صحيحة" };
  }

  const token = await createSessionToken();
  const store = await cookies();
  store.set(sessionCookie.name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionCookie.maxAge,
  });

  redirect("/admin");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect("/login");
}

