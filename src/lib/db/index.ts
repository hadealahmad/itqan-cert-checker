import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/cert-checker.db";
const filePath = url.startsWith("file:") ? url.slice("file:".length) : url;
const absolute = resolve(process.cwd(), filePath);

mkdirSync(dirname(absolute), { recursive: true });

const globalForDb = globalThis as unknown as {
  __sqlite?: Database.Database;
};

const sqlite =
  globalForDb.__sqlite ??
  new Database(absolute, {
    // WAL keeps the render workers from blocking admin reads.
    verbose: process.env.SQLITE_VERBOSE === "1" ? console.log : undefined,
  });

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
export { sqlite };
