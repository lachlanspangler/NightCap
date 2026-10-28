import { describe, expect, it } from "vitest";
import { createPglite, listMigrations, migrate } from "../src";

describe("migrations", () => {
  it("apply from scratch and are idempotent", async () => {
    const { pg } = await createPglite();
    expect(await migrate(pg)).toEqual([]);
    const tables = (
      await pg.query<{ t: string }>(
        `select tablename as t from pg_tables where schemaname = 'public' order by 1`,
      )
    ).rows.map((r) => r.t);
    expect(tables).toEqual(
      expect.arrayContaining([
        "profiles",
        "crews",
        "crew_members",
        "nights",
        "night_members",
        "shots",
        "shot_hides",
        "shot_tags",
        "reactions",
        "blocks",
        "reports",
        "invites",
      ]),
    );
    await pg.close();
  });
  it("every public table has RLS enabled", async () => {
    const { pg } = await createPglite();
    const off = (
      await pg.query<{ t: string }>(
        `select relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and relname <> '_migrations'`,
      )
    ).rows;
    expect(off).toEqual([]);
    await pg.close();
  });
  it("skips the Supabase shim for the supabase target, numbered contiguously", () => {
    const all = listMigrations("pglite").map((m) => m.name);
    expect(listMigrations("supabase").map((m) => m.name)).toEqual(all.filter((n) => !n.startsWith("0000_")));
    all.forEach((n, i) => expect(n.startsWith(String(i).padStart(4, "0"))).toBe(true));
  });
  it("anon has no access to anything", async () => {
    const { pg } = await createPglite();
    await pg.exec(`set role anon`);
    await expect(pg.query(`select * from public.profiles`)).rejects.toThrow(/permission denied/);
    await pg.close();
  });
});

describe("transactions", () => {
  it("nested transactions fail loudly instead of deadlocking", async () => {
    const { createPglite: mk, asUser: au, asService: as } = await import("../src");
    const { db } = await mk();
    await expect(as(db, () => au(db, "11111111-1111-4111-8111-111111111111", async () => 1))).rejects.toThrow(
      /nested transaction/,
    );
    // and the connection is still usable afterwards
    expect(await as(db, async (tx) => (await tx.query<{ x: number }>("select 1 as x")).rows[0]!.x)).toBe(1);
    await db.close();
  });
});
