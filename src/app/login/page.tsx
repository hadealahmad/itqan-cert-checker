import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { LoginChoices } from "@/components/login-choices";
import { currentParticipant, isAuthenticated } from "@/lib/session";
import { githubConfigured } from "@/lib/github";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  robots: { index: false, follow: false },
};

const GITHUB_ERRORS: Record<string, string> = {
  denied: "لم تكتمل عملية الدخول عبر GitHub.",
  "bad-state": "انتهت صلاحية الطلب، يرجى المحاولة مرة أخرى.",
  "exchange-failed": "تعذّر الاتصال بـ GitHub، يرجى المحاولة لاحقًا.",
  "not-configured": "الدخول عبر GitHub غير مُفعّل بعد. تواصل مع المشرف.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  if (await isAuthenticated()) redirect("/admin");
  if (await currentParticipant()) redirect("/my/certificate");

  const params = await searchParams;
  const notice = params.github ? GITHUB_ERRORS[params.github] : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <LoginForm />
        {githubConfigured() ? (
          <LoginChoices notice={notice} />
        ) : notice ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
            {notice}
          </p>
        ) : null}
      </div>
    </main>
  );
}
