import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright + better-sqlite3 are native/server-only; keep them external.
  serverExternalPackages: ["better-sqlite3", "playwright", "archiver"],
  outputFileTracingIncludes: {
    "/p/**": ["./public/**/*", "./src/**/*"],
  },
  // The floating dev badge would otherwise appear in certificate screenshots.
  devIndicators: false,
};

export default nextConfig;
