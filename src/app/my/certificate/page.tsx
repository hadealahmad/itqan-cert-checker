import Link from "next/link";
import { redirect } from "next/navigation";

import { CertificatePanel } from "@/components/participant/certificate-panel";
import { ClaimForm } from "@/components/participant/claim-form";
import { IneligiblePanel } from "@/components/participant/claim-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentParticipant, clearParticipantSession } from "@/lib/session";
import { findCertificateForTemplate, getUser, listCertificatesForUser } from "@/lib/certs";
import { formatGregorianArabic, formatHijriArabic } from "@/lib/dates";
import { formatCode } from "@/lib/code-format";
import { activePrograms } from "@/lib/programs";

export const dynamic = "force-dynamic";

export const metadata = { title: "شهادتي", robots: { index: false, follow: false } };

/**
 * The participant's own view: claim a certificate, or see and edit the one they
 * already hold. Reached after a GitHub eligibility check.
 */
export default async function MyCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; eligible?: string }>;
}) {
  const session = await currentParticipant();
  if (!session) redirect("/login");

  const params = await searchParams;
  const programs = activePrograms();
  const program =
    programs.find((row) => String(row.id) === params.program) ?? programs[0] ?? null;

  const user = getUser(session.userId);
  if (!user) redirect("/login");

  const cert = program ? findCertificateForTemplate(user.id, program.templateId) : undefined;
  const all = listCertificatesForUser(user.id);

  const eligible = user.lastEligible === 1;
  const programLabel = program?.nameAr ?? programs[0]?.nameAr ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-5 py-10 sm:py-14">
      <header className="space-y-1 text-center">
        <p className="text-xs text-muted-foreground">مرحبًا</p>
        <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
        {session.githubLogin ? (
          <p className="ltr text-xs text-muted-foreground">@{session.githubLogin}</p>
        ) : null}
      </header>

      {!program ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-medium">لا توجد حملة متاحة حاليًا</p>
            <p className="text-sm text-muted-foreground">
              لم يقم المشرف بتفعيل أي حملة بعد. أعد المحاولة لاحقًا.
            </p>
          </CardContent>
        </Card>
      ) : cert ? (
        <CertificatePanel
          certificate={{
            id: cert.id,
            code: formatCode(cert.code),
            issuedOn: cert.issuedOn,
            gregorian: formatGregorianArabic(cert.issuedOn),
            hijri: formatHijriArabic(cert.issuedOn),
            status: cert.status,
            revokeReason: cert.revokeReason,
            printToken: cert.printToken,
          }}
          currentName={user.name}
          currentGender={user.gender}
          programName={programLabel}
        />
      ) : eligible ? (
        <ClaimForm
          programId={program.id}
          templateId={program.templateId}
          programName={programLabel}
          defaultName={user.name}
          defaultGender={user.gender}
        />
      ) : (
        <IneligiblePanel
          programName={programLabel}
          githubLogin={session.githubLogin}
          window={{ from: program.contributionFrom, to: program.contributionTo }}
          repos={program.repos.map((repo) => `${repo.owner}/${repo.repo}`)}
        />
      )}

      {all.length > 1 ? (
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="text-sm font-medium">كل شهاداتك</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {all.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <span>{formatCode(row.code)}</span>
                  <span>{formatGregorianArabic(row.issuedOn)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-center">
        <form action={clearParticipantSession}>
          <Button type="submit" variant="ghost" size="sm">
            تسجيل الخروج
          </Button>
        </form>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/verify" className="underline underline-offset-4">
          التحقق من شهادة برقم
        </Link>
      </p>
    </main>
  );
}
