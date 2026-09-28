import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { isAuthenticated } from "@/lib/auth";

export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
