import type { Metadata } from "next";

import { VerifyPage } from "@/components/verify/verify-app";

export const metadata: Metadata = {
  title: "التحقق من الشهادة — مجتمع إتقان",
  description: "تحقق من صحة شهادة التقدير الصادرة عن مجتمع إتقان",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <VerifyPage />;
}
