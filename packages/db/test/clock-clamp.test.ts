// Code review M1 #3: on Supabase (no shim) RPCs must not trust the caller's p_now.
import { describe, expect, it } from "vitest";
import { asUser, createPglite, dbErrorCode, makeUser } from "../src";

describe("client-supplied time is clamped outside mock mode", () => {
  it("walking p_now forward doesn't dodge the code-guess rate limit", async () => {
    const { pg, db } = await createPglite();
    await pg.exec(
      `create or replace function public.nc_clock_override_allowed() returns boolean language sql immutable as $$ select false $$`,
    );
    const u = await makeUser(db, "Guesser");
    const results: string[] = [];
    for (let k = 0; k < 12; k++) {
      const fake = new Date(Date.now() + k * 11 * 60_000); // 11 minutes "later" each time
      const r = await asUser(db, u, (tx) =>
        tx.query(`select join_night_by_code($1, $2) as id`, [String(1000 + k), fake]),
      ).then(
        () => "ok",
        (e) => dbErrorCode(e) ?? String(e),
      );
      results.push(r);
    }
    expect(results.slice(0, 10).every((r) => r === "ok")).toBe(true); // wrong codes → null (unavailable)
    expect(results.slice(10)).toEqual(["rate_limited", "rate_limited"]);
    const stamps = await pg.query<{ late: boolean }>(
      `select max(attempted_at) > now() + interval '5 minutes' as late from code_attempts`,
    );
    expect(stamps.rows[0]!.late).toBe(false);
    await db.close();
  });
  it("anon can execute nothing", async () => {
    const { pg } = await createPglite();
    await pg.exec(`set role anon`);
    await expect(pg.query(`select public.join_night_by_code('1234', now())`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      pg.query(`select public.blocked_either(gen_random_uuid(), gen_random_uuid())`),
    ).rejects.toThrow(/permission denied/);
    await pg.close();
  });
  it("mock mode (shim) still allows the dev clock", async () => {
    const { pg } = await createPglite();
    const r = await pg.query<{ t: string }>(`select public.nc_now('2030-01-01T00:00:00Z')::text as t`);
    expect(r.rows[0]!.t).toContain("2030-01-01");
    await pg.close();
  });
});
