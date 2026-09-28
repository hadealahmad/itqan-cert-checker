import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Self-hosted from src/fonts via next/font/local. Deliberately not
 * next/font/google: the certificate print route is a critical path and must
 * never depend on a network fetch at build or render time.
 */
const ibmPlexArabic = localFont({
  src: [
    { path: "../fonts/IBMPlexSansArabic-Light.woff2", weight: "300", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
  fallback: ["sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "نظام الشهادات — مجتمع إتقان",
    template: "%s — مجتمع إتقان",
  },
  description: "إصدار شهادات التقدير والتحقق منها",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#014B3F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={ibmPlexArabic.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-center" dir="rtl" richColors />
      </body>
    </html>
  );
}
