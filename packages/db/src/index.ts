// Postgres access for NightCap (ADR 0002). One small interface, two drivers:
//   PGlite (mock mode + tests): real Postgres in WASM, in-process.
//   postgres.js (prod, DATABASE_URL): see apps/api/src/db/postgres.ts.
// Every user-facing query runs in `asUser`, which switches to the `authenticated` role and sets
// request.jwt.claims for the transaction, so RLS is enforced exactly like Supabase/PostgREST.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Run `fn` in one transaction. Nested calls are not supported. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export type MigrationTarget = "pglite" | "supabase";

export function listMigrations(target: MigrationTarget = "pglite"): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .filter((f) => target === "pglite" || !f.startsWith("0000_"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

const inTx = new AsyncLocalStorage<boolean>();

/** A serialising wrapper: PGlite is single-connection, so transactions must not interleave. */
export function pgliteDb(pg: PGlite): Db {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    query: <T>(sql: string, params?: unknown[]) =>
      serial(async () => ({ rows: (await pg.query<T>(sql, params as unknown[])).rows })),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) => {
      // PGlite has one connection: a transaction started inside another would wait forever.
      if (inTx.getStore()) {
        return Promise.reject(
          new Error("nested transaction (would deadlock on PGlite): finish the outer one first"),
        );
      }
      return serial(() =>
        pg.transaction(async (tx) =>
          inTx.run(true, () =>
            fn({
              query: async <R>(sql: string, params?: unknown[]) => ({
                rows: (await tx.query<R>(sql, params as unknown[])).rows,
              }),
            }),
          ),
        ),
      );
    },
    close: () => pg.close(),
  };
}

export class MigrationDriftError extends Error {}

/**
 * Apply pending migrations. Each applied migration's sha256 is recorded; if a file that was
 * already applied has since been edited, refuse to start (a silently diverged dev DB once made
 * the mock clock fall back to production clamping). Fix with `make reset-db`.
 */
export async function migrate(pg: PGlite, target: MigrationTarget = "pglite"): Promise<string[]> {
  await pg.exec(
    `create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now(), sha256 text)`,
  );
  await pg.exec(`alter table public._migrations add column if not exists sha256 text`);
  const done = new Map(
    (
      await pg.query<{ name: string; sha256: string | null }>(`select name, sha256 from public._migrations`)
    ).rows.map((r) => [r.name, r.sha256]),
  );
  const applied: string[] = [];
  for (const m of listMigrations(target)) {
    const hash = createHash("sha256").update(m.sql).digest("hex");
    if (done.has(m.name)) {
      const was = done.get(m.name);
      if (was && was !== hash)
        throw new MigrationDriftError(
          `migration ${m.name} changed after it was applied to this database: run \`make reset-db\``,
        );
      if (!was) await pg.query(`update public._migrations set sha256 = $2 where name = $1`, [m.name, hash]);
      continue;
    }
    await pg.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query(`insert into public._migrations (name, sha256) values ($1, $2)`, [m.name, hash]);
    });
    applied.push(m.name);
  }
  return applied;
}

/** A fresh, migrated PGlite (in-memory unless `dataDir` is given). */
export async function createPglite(dataDir?: string): Promise<{ pg: PGlite; db: Db }> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await migrate(pg);
  return { pg, db: pgliteDb(pg) };
}

/** Run `fn` as the given user, under RLS. */
export function asUser<T>(db: Db, userId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await tx.query(`set local role authenticated`);
    return fn(tx);
  });
}

/** Run `fn` as service_role (bypasses RLS). Only for the API's internal steps and seeding. */
export function asService<T>(db: Db, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: "service_role" }),
    ]);
    await tx.query(`set local role service_role`);
    return fn(tx);
  });
}

/** Maps our RPC errors (raise 'code' using errcode P0001) and RLS denials to stable codes. */
export function dbErrorCode(e: unknown): string | null {
  const err = e as { code?: string; message?: string };
  if (err?.code === "P0001" && err.message) return err.message;
  if (err?.code === "42501") return "forbidden"; // insufficient_privilege / RLS with check
  if (err?.code === "23505") return "conflict";
  if (err?.code === "23503") return "not_found"; // FK target missing: same as "doesn't exist"
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "22007" || err?.code === "22008")
    return "invalid";
  if (/row-level security/i.test(err?.message ?? "")) return "forbidden";
  return null;
}

export * from "./testkit";
