import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Certificate } from "@/components/certificate/certificate";
import { certificateValues, getCertificateByPrintToken, getUser } from "@/lib/certs";
import { qrSvg, verifyUrl } from "@/lib/qr";

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

  // Gender is read live from the user record: correcting it and re-rendering is
  // the intended way to fix a certificate that was worded wrongly.
  const recipient = getUser(cert.userId);
  const values = certificateValues(cert, recipient?.gender ?? "male");
  const qr = await qrSvg(cert.code);

  return (
    <main className="m-0 bg-white p-0" style={{ width: 1920, height: 1358 }}>
      <Certificate values={{ ...values, qrSvg: qr, verifyUrl: verifyUrl(cert.code) }} />
    </main>
  );
}
