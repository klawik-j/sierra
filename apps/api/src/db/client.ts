import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle")].find((p) => existsSync(p))!;

/**
 * DATABASE_URL set   -> real PostgreSQL (docker-compose locally, RDS/Aurora on AWS).
 * DATABASE_URL empty -> embedded PostgreSQL (PGlite) persisted in PGLITE_DIR, zero setup.
 * PGLITE_DIR=memory  -> throwaway in-memory database (tests).
 */
async function createDb(): Promise<{ db: DB; migrate: () => Promise<void>; kind: string }> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: Number(process.env.DB_POOL_MAX || 10) });
    const db = drizzle(client, { schema, casing: "snake_case" });
    return { db: db as unknown as DB, migrate: () => migrate(db, { migrationsFolder }), kind: "postgres" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const inMemory = process.env.PGLITE_DIR === "memory";
  const dir = path.resolve(process.cwd(), process.env.PGLITE_DIR || "./.data/pg");
  if (!inMemory) mkdirSync(dir, { recursive: true });
  const client = inMemory ? new PGlite() : new PGlite(dir);
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db: db as unknown as DB, migrate: () => migrate(db, { migrationsFolder }), kind: inMemory ? "pglite (memory)" : `pglite (${dir})` };
}

export const { db, migrate, kind: dbKind } = await createDb();
