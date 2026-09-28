"use client";

import { Ban, BadgeCheck, CircleSlash, Download, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGregorianArabic, formatHijriArabic } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { VerifyResult } from "@/lib/verify";

const LOOK = {
  valid: {
    icon: BadgeCheck,
    title: "شهادة صالحة",
    ring: "ring-emerald-200 bg-emerald-50",
    tone: "text-emerald-700",
  },
  revoked: {
    icon: Ban,
    title: "شهادة ملغاة",
    ring: "ring-amber-200 bg-amber-50",
    tone: "text-amber-700",
  },
  not_found: {
    icon: CircleSlash,
    title: "لا توجد شهادة",
    ring: "ring-red-200 bg-red-50",
    tone: "text-destructive",
  },
} as const;

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", mono && "ltr font-semibold tracking-wide")}>{value}</span>
    </div>
  );
}

export function VerifyApp() {
  const params = useSearchParams();
  const deepLink = params.get("code");

  const [code, setCode] = useState(deepLink ?? "");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pending, setPending] = useState(false);
  // Stops a ?code= arrival from re-checking on every re-render.
  const autoChecked = useRef<string | null>(null);

  const run = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      setResult(response.ok ? ((await response.json()) as VerifyResult) : null);
    } catch {
      setResult(null);
    } finally {
      setPending(false);
    }
  }, []);

  // Arriving by scan or click: check the deep-linked code straight away.
  useEffect(() => {
    if (!deepLink || autoChecked.current === deepLink) return;
    autoChecked.current = deepLink;
    void run(deepLink);
  }, [deepLink, run]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void run(code);
  }

  const look = result ? LOOK[result.outcome] : null;
  const Icon = look?.icon;
  const cert = result?.certificate;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-5 py-10 sm:py-16">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
          إ
        </div>
        <h1 className="text-xl font-semibold tracking-tight">مجتمع إتقان للتقنيات القرآنية</h1>
        <p className="text-sm text-muted-foreground">التحقق من الشهادات</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Label htmlFor="code" className="sr-only">
          رقم الشهادة
        </Label>
        <Input
          id="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="20261234"
          autoComplete="off"
          autoFocus
          inputMode="numeric"
          // The code is Latin and read left-to-right even in an RTL form.
          dir="ltr"
          className="ltr h-12 text-center text-lg tracking-[0.3em]"
          aria-label="رقم الشهادة"
        />
        <Button type="submit" className="h-11 w-full" disabled={pending || code.trim() === ""}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "جارٍ التحقق…" : "تحقق"}
        </Button>
      </form>

      {result && look && Icon ? (
        <section className="space-y-5 rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className={cn("flex size-14 items-center justify-center rounded-full ring-4", look.ring)}>
              <Icon className={cn("size-7", look.tone)} strokeWidth={1.75} />
            </div>
            <p className={cn("text-lg font-semibold", look.tone)}>{look.title}</p>
            <p className="text-sm text-muted-foreground">{result.message}</p>
          </div>

          {cert ? (
            <>
              <div className="border-t pt-1">
                <Row label="اسم المستلم" value={cert.recipientName} />
                <Row label="رقم الشهادة" value={cert.display} mono />
                <Row label="تاريخ الإصدار" value={formatGregorianArabic(cert.issuedOn)} />
                <Row label="التاريخ الهجري" value={formatHijriArabic(cert.issuedOn)} />
              </div>

              {cert.status === "revoked" && cert.revokeReason ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                  سبب الإلغاء: {cert.revokeReason}
                </p>
              ) : null}

              {/*
                The PDF is generated on this click, not before. Nothing renders
                until a download is actually requested.
              */}
              <Button asChild className="h-11 w-full">
                <a href={`/p/${cert.printToken}/download?format=pdf`} download>
                  <Download className="size-4" />
                  تحميل الشهادة (PDF)
                </a>
              </Button>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

/** Suspense wrapper: useSearchParams forces a client boundary. */
export function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyApp />
    </Suspense>
  );
}
