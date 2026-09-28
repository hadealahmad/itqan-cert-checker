import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Certificate } from "@/components/certificate/certificate";
import { certificateValues, getCertificateByPrintToken, getUser } from "@/lib/certs";
import { qrSvg, verifyUrl } from "@/lib/qr";
import { requireTemplate } from "@/lib/templates";
import { getTemplateById } from "@/lib/programs";

/** Always live: a print token may point at a cert that was just issued. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "شهادة",
  robots: { index: false, follow: false },
};

export default async function PrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cert = getCertificateByPrintToken(token);
  if (!cert) notFound();

  const record = getTemplateById(cert.templateId);
  if (!record) notFound();
  const template = requireTemplate(record.slug);

  // Gender is read live from the user record: correcting it and re-rendering is
  // the intended way to fix a certificate that was worded wrongly.
  const recipient = getUser(cert.userId);
  const values = certificateValues(cert, recipient?.gender ?? "male");
  const qr = await qrSvg(cert.code, template.qr);

  return (
    <main
      className="m-0 bg-white p-0"
      style={{ width: template.frame.width, height: template.frame.height }}
    >
      <Certificate
        template={template}
        values={{ ...values, qrSvg: qr, verifyUrl: verifyUrl(cert.code) }}
      />
    </main>
  );
}
