import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Overridable so a test harness can build into its own directory. `next dev`
  // and `next build` write to the same .next by default, so building while a dev
  // server is running corrupts it — the symptom is pages 500-ing with
  // "a[d] is not a function", which reads as a broken feature rather than a
  // clobbered build directory. check:e2e sets this to .next-e2e.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Playwright + better-sqlite3 are native/server-only; keep them external.
  serverExternalPackages: ["better-sqlite3", "playwright", "archiver"],
  outputFileTracingIncludes: {
    "/p/**": ["./public/**/*", "./src/**/*"],
  },
  // The floating dev badge would otherwise appear in certificate screenshots.
  devIndicators: false,
};

export default nextConfig;
