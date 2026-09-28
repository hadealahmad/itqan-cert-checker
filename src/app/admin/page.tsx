import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCertificates, stats } from "@/lib/certs";
import { formatCode } from "@/lib/code-format";
import { formatGregorianArabic } from "@/lib/dates";

const OUTCOME_LABEL: Record<string, string> = {
  issued: "صالح",
  revoked: "ملغاة",
  not_found: "غير موجودة",
  bad_format: "صيغة غير صالحة",
};

export default function AdminDashboardPage() {
  const s = stats();
  const recent = listCertificates({ limit: 12 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">نظرة عامة</h1>
        <p className="text-sm text-muted-foreground">ملخص النشاط في النظام</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="المستخدمون" value={s.users} />
        <StatCard label="الشهادات" value={s.certificates} />
        <StatCard label="شهادات ملغاة" value={s.revoked} tone={s.revoked > 0 ? "warn" : "plain"} />
      </div>

      <div>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">أحدث الشهادات</CardTitle>
              <CardDescription>آخر 12 شهادة</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/certs">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState href="/admin/certs" label="لم تُصدر أي شهادة بعد" />
            ) : (
              <ul className="divide-y">
                {recent.map((cert) => (
                  <li key={cert.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{cert.recipientName}</p>
                      <p className="ltr text-xs text-muted-foreground">
                        {formatCode(cert.code)} · {formatGregorianArabic(cert.issuedOn)}
                      </p>
                    </div>
                    <StatusBadge status={cert.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: number;
  tone?: "plain" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-600" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "revoked" ? (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
      ملغاة
    </Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
      سارية
    </Badge>
  );
}

function EmptyState({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button asChild size="sm" variant="outline">
        <Link href={href}>الذهاب إلى الشهادات</Link>
      </Button>
    </div>
  );
}
