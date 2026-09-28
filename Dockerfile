# Chromium is required for certificate rendering, so the build image ships the
# full Playwright browser set rather than a slim Next.js base.
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps -------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# better-sqlite3 is a native module; prebuild it for the runtime image.
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_PUBLIC_BASE_URL=http://localhost:3000
WORKDIR /app

# Chromium's sandbox needs privileges the container does not grant; the app
# already launches with --no-sandbox, and this keeps the shm workaround honest.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/fonts ./src/fonts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Certificate PDFs/PNGs and the SQLite file must outlive the container.
VOLUME ["/app/storage", "/app/data"]
RUN mkdir -p /app/storage /app/data

EXPOSE 3000
CMD ["npm", "run", "start"]
