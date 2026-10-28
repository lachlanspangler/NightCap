import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createPglite, dbErrorCode, makeUser, service, type Db } from "../src";

let db: Db;
let ava: string, noah: string, lena: string, outsider: string, notOptedIn: string;
let event: string, table: string;

const q = (u: string, sql: string, p: unknown[] = []) => asUser(db, u, (tx) => tx.query(sql, p));
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => dbErrorCode(e) ?? String(e),
  );

beforeAll(async () => {
  db = (await createPglite()).db;
  [ava, noah, lena, outsider, notOptedIn] = [
    await makeUser(db, "Ava"),
    await makeUser(db, "Noah"),
    await makeUser(db, "Lena"),
    await makeUser(db, "Out"),
    await makeUser(db, "Nope"),
  ];
  for (const u of [ava, noah, lena, outsider])
    await service(
      db,
      `update profiles set city_opt_in = true, coc_accepted_at = now(), age_verified_at = now() where id = $1`,
      [u],
    );
  event = (
    (
      await service(
        db,
        `insert into city_events (city, title, venue_name, starts_at) values ('minneapolis', 'Trivia', 'The Nook', now() + interval '1 day') returning id`,
      )
    ).rows[0] as { id: string }
  ).id;
  table = (
    (await service(db, `insert into city_tables (event_id) values ($1) returning id`, [event])).rows[0] as {
      id: string;
    }
  ).id;
  for (const u of [ava, noah, lena])
    await service(db, `insert into city_table_members (table_id, user_id) values ($1, $2)`, [table, u]);
});
afterAll(async () => db.close());

describe("city RLS", () => {
  it("events are visible only to verified, opted-in people", async () => {
    expect((await q(ava, `select id from city_events`)).rows).toHaveLength(1);
    expect((await q(notOptedIn, `select id from city_events`)).rows).toEqual([]);
    expect((await q(notOptedIn, `select city_signup_count($1) as n`, [event])).rows).toEqual([{ n: 0 }]);
  });
  it("city_signups: only your own row, only for yourself, only while open", async () => {
    expect(
      await code(
        q(
          outsider,
          `insert into city_signups (event_id, user_id, block_id) values ($1, $2, gen_random_uuid())`,
          [event, outsider],
        ),
      ),
    ).toBe("ok");
    expect(
      await code(
        q(
          outsider,
          `insert into city_signups (event_id, user_id, block_id) values ($1, $2, gen_random_uuid())`,
          [event, ava],
        ),
      ),
    ).toBe("forbidden");
    expect(
      await code(
        q(
          notOptedIn,
          `insert into city_signups (event_id, user_id, block_id) values ($1, $2, gen_random_uuid())`,
          [event, notOptedIn],
        ),
      ),
    ).toBe("forbidden");
    expect((await q(ava, `select * from city_signups`)).rows).toEqual([]);
    await service(db, `update city_events set tables_formed_at = now() where id = $1`, [event]);
    expect(
      await code(
        q(ava, `insert into city_signups (event_id, user_id, block_id) values ($1, $2, gen_random_uuid())`, [
          event,
          ava,
        ]),
      ),
    ).toBe("forbidden");
  });
  it("city_table_members: tablemates see each other; outsiders see nobody; blocks hide", async () => {
    expect(
      (await q(ava, `select user_id from city_table_members where table_id = $1`, [table])).rows,
    ).toHaveLength(3);
    expect((await q(outsider, `select user_id from city_table_members`)).rows).toEqual([]);
    expect((await q(outsider, `select id from profiles where id = $1`, [ava])).rows).toEqual([]);
    expect((await q(noah, `select id from profiles where id = $1`, [ava])).rows).toHaveLength(1);
    await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [lena, ava]);
    const seen = (
      await q(ava, `select user_id from city_table_members where table_id = $1`, [table])
    ).rows.map((r) => (r as { user_id: string }).user_id);
    expect(seen.sort()).toEqual([ava, noah].sort());
  });
  it("keep_in_touch: only tablemates, only your own answers, matches only when mutual", async () => {
    expect(
      await code(
        q(
          ava,
          `insert into keep_in_touch (event_id, from_user_id, to_user_id, yes) values ($1, $2, $3, true)`,
          [event, ava, noah],
        ),
      ),
    ).toBe("ok");
    expect(
      await code(
        q(
          ava,
          `insert into keep_in_touch (event_id, from_user_id, to_user_id, yes) values ($1, $2, $3, true)`,
          [event, ava, outsider],
        ),
      ),
    ).toBe("forbidden");
    expect(
      await code(
        q(
          ava,
          `insert into keep_in_touch (event_id, from_user_id, to_user_id, yes) values ($1, $2, $3, true)`,
          [event, noah, ava],
        ),
      ),
    ).toBe("forbidden");
    expect((await q(noah, `select * from keep_in_touch`)).rows).toEqual([]);
    expect((await q(ava, `select * from my_connections()`)).rows).toEqual([]);
    await q(
      noah,
      `insert into keep_in_touch (event_id, from_user_id, to_user_id, yes) values ($1, $2, $3, true)`,
      [event, noah, ava],
    );
    expect((await q(ava, `select user_id from my_connections()`)).rows).toEqual([{ user_id: noah }]);
    await q(noah, `update keep_in_touch set yes = false where from_user_id = $1`, [noah]);
    expect((await q(ava, `select user_id from my_connections()`)).rows).toEqual([]);
  });
});
