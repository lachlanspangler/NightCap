import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeNightSchedule } from "@nightcap/core";
import {
  asService,
  asUser,
  createPglite,
  dbErrorCode,
  makeCrew,
  makeNight,
  makeShot,
  makeUser,
  service,
  type Db,
  type Queryable,
} from "../src";

let db: Db;
let maya: string, theo: string, jules: string, sam: string, stranger: string;
let crew: string;

const NOW = new Date("2026-10-31T02:00:00Z"); // Fri 21:00 CDT
const as = <T>(u: string, fn: (tx: Queryable) => Promise<T>) => asUser(db, u, fn);
const q = (u: string, sql: string, params: unknown[] = []) => as(u, (tx) => tx.query(sql, params));
const code = async (p: Promise<unknown>) => {
  try {
    const r = (await p) as { rows?: Record<string, unknown>[] } | undefined;
    // join_night_by_code returns null for a wrong code (so the attempt is recorded); treat as unavailable.
    if (r?.rows?.length === 1 && "join_night_by_code" in r.rows[0]! && r.rows[0]!.join_night_by_code === null)
      return "unavailable";
    return "ok";
  } catch (e) {
    return dbErrorCode(e) ?? String((e as Error).message);
  }
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeAll(async () => {
  db = (await createPglite()).db;
});
afterAll(async () => db.close());

let n = 0;
beforeEach(async () => {
  n++;
  maya = await makeUser(db, `Maya${n}`);
  theo = await makeUser(db, `Theo${n}`);
  jules = await makeUser(db, `Jules${n}`);
  sam = await makeUser(db, `Sam${n}`);
  stranger = await makeUser(db, `Stranger${n}`);
  crew = await makeCrew(db, maya, [maya, theo, jules, sam]);
});

describe("profiles", () => {
  it("crewmates see each other's names; strangers don't exist", async () => {
    const r = await q(maya, `select id from profiles where id = any($1)`, [[theo, stranger]]);
    expect(r.rows.map((x) => (x as { id: string }).id)).toEqual([theo]);
  });
  it("birthdate is never readable, even your own", async () => {
    expect(await code(q(maya, `select birthdate from profiles where id = $1`, [maya]))).toBe("forbidden");
  });
  it("you can update your own display name, not someone else's", async () => {
    await q(maya, `update profiles set display_name = 'M' where id = $1`, [maya]);
    const r = await q(theo, `update profiles set display_name = 'X' where id = $1 returning id`, [maya]);
    expect(r.rows).toEqual([]);
    expect((await service(db, `select display_name from profiles where id = $1`, [maya])).rows[0]).toEqual({
      display_name: "M",
    });
  });
  it("you can't verify your own age", async () => {
    expect(await code(q(maya, `update profiles set age_verified_at = now() where id = $1`, [maya]))).toBe(
      "forbidden",
    );
  });
});

describe("crews", () => {
  it("only members see a crew and its members", async () => {
    expect((await q(stranger, `select * from crews where id = $1`, [crew])).rows).toEqual([]);
    expect((await q(stranger, `select * from crew_members where crew_id = $1`, [crew])).rows).toEqual([]);
    expect((await q(theo, `select * from crew_members where crew_id = $1`, [crew])).rows).toHaveLength(4);
  });
  it("create_crew makes you the owner", async () => {
    const id = await as(
      stranger,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            `select create_crew('New', '🍸', 'long_distance', 'America/Chicago', $1) as id`,
            [NOW],
          )
        ).rows[0]!.id,
    );
    expect((await q(stranger, `select role from crew_members where crew_id = $1`, [id])).rows).toEqual([
      { role: "owner" },
    ]);
  });
  it("only owners rename; members can leave; owners can remove", async () => {
    expect(
      (await q(theo, `update crews set name = 'Theo crew' where id = $1 returning id`, [crew])).rows,
    ).toEqual([]);
    expect(
      (await q(maya, `update crews set name = 'Owls' where id = $1 returning id`, [crew])).rows,
    ).toHaveLength(1);
    expect(
      (
        await q(theo, `delete from crew_members where crew_id = $1 and user_id = $2 returning user_id`, [
          crew,
          jules,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await q(theo, `delete from crew_members where crew_id = $1 and user_id = $2 returning user_id`, [
          crew,
          theo,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await q(maya, `delete from crew_members where crew_id = $1 and user_id = $2 returning user_id`, [
          crew,
          jules,
        ])
      ).rows,
    ).toHaveLength(1);
  });
});

describe("start_night / join / end", () => {
  const s = computeNightSchedule(NOW, "America/Chicago");
  const start = (u: string, c = crew, codeStr: string | null = "4821") =>
    as(
      u,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            `select start_night($1, 'Halloween', 'The Nook', 'America/Chicago', $2, $3, $4, $5, $6, 24) as id`,
            [c, NOW, s.autoEndAt, s.unlockAt, s.earliestUnlockAt, codeStr],
          )
        ).rows[0]!.id,
    );

  it("a member starts a night; the crew is notified; one live night per crew", async () => {
    const id = await start(maya);
    const notes = await service(
      db,
      `select user_id from notifications where kind = 'night_started' and payload->>'night_id' = $1`,
      [id],
    );
    expect(notes.rows.map((r) => (r as { user_id: string }).user_id).sort()).toEqual(
      [theo, jules, sam].sort(),
    );
    expect(await code(start(theo, crew, "1111"))).toBe("crew_has_live_night");
  });
  it("non-members can't start; bad schedules are refused", async () => {
    expect(await code(start(stranger))).toBe("not_member");
    const bad = as(maya, (tx) =>
      tx.query(`select start_night($1, null, null, 'America/Chicago', $2, $3, $2, $2, null, 24)`, [
        crew,
        NOW,
        s.autoEndAt,
      ]),
    );
    expect(await code(bad)).toBe("bad_schedule");
  });
  it("crew members join directly; strangers need the code; wrong code = unavailable", async () => {
    const id = await start(maya, crew, "7777");
    await as(theo, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, NOW]));
    expect(await code(as(stranger, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, NOW])))).toBe(
      "no_access",
    );
    expect(await code(as(stranger, (tx) => tx.query(`select join_night_by_code('0000', $1)`, [NOW])))).toBe(
      "unavailable",
    );
    await as(stranger, (tx) => tx.query(`select join_night_by_code('7777', $1)`, [NOW]));
    const members = await q(maya, `select user_id from night_members where night_id = $1`, [id]);
    expect(members.rows).toHaveLength(3);
  });
  it("guests see the night they joined but not the crew", async () => {
    const id = await start(maya, crew, "5150");
    await as(stranger, (tx) => tx.query(`select join_night_by_code('5150', $1)`, [NOW]));
    expect((await q(stranger, `select id from nights where id = $1`, [id])).rows).toHaveLength(1);
    expect((await q(stranger, `select id from crews where id = $1`, [crew])).rows).toEqual([]);
  });
  it("blocked: joining by code fails with the same error as a wrong code", async () => {
    await start(maya, crew, "9090");
    await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [maya, stranger]);
    expect(await code(as(stranger, (tx) => tx.query(`select join_night_by_code('9090', $1)`, [NOW])))).toBe(
      "unavailable",
    );
  });
  it("code guessing is rate-limited (10 per 10 minutes)", async () => {
    for (let k = 0; k < 10; k++)
      await code(
        as(stranger, (tx) => tx.query(`select join_night_by_code($1, $2)`, [String(1000 + k), NOW])),
      );
    expect(await code(as(stranger, (tx) => tx.query(`select join_night_by_code('2000', $1)`, [NOW])))).toBe(
      "rate_limited",
    );
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(await code(as(stranger, (tx) => tx.query(`select join_night_by_code('2000', $1)`, [later])))).toBe(
      "unavailable",
    );
  });
  it("you can only be in one live night at a time", async () => {
    await start(maya, crew, "3141");
    const other = await makeCrew(db, theo, [theo, stranger], "Other");
    const id2 = await start(theo, other, "2718").catch(() => null);
    // theo isn't in maya's night yet, so this works; joining maya's now fails
    expect(id2).toBeTruthy();
    // By code: the same generic answer as a wrong code (no oracle, review #4)…
    expect(await code(as(theo, (tx) => tx.query(`select join_night_by_code('3141', $1)`, [NOW])))).toBe(
      "unavailable",
    );
    // …directly from the crew, it says why.
    const mayas = (await service(db, `select id from nights where join_code = '3141'`)).rows[0] as {
      id: string;
    };
    expect(await code(as(theo, (tx) => tx.query(`select join_crew_night($1, $2)`, [mayas.id, NOW])))).toBe(
      "already_in_live_night",
    );
  });
  it("only the starter or an owner ends it", async () => {
    const id = await start(theo, crew, "1212");
    await as(jules, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, NOW]));
    expect(await code(as(jules, (tx) => tx.query(`select end_night($1, $2)`, [id, NOW])))).toBe(
      "not_allowed",
    );
    expect(await code(as(maya, (tx) => tx.query(`select end_night($1, $2)`, [id, NOW])))).toBe("ok"); // owner
    expect(await code(as(theo, (tx) => tx.query(`select end_night($1, $2)`, [id, NOW])))).toBe("not_live");
  });
  it("authenticated users can't advance nights (service_role only)", async () => {
    const id = await start(maya, crew, "6060");
    expect(
      await code(
        as(maya, (tx) => tx.query(`select apply_night_advance($1, $2, $2, 'scheduled')`, [id, NOW])),
      ),
    ).toBe("forbidden");
    expect(
      await code(as(maya, (tx) => tx.query(`update nights set unlocked_at = now() where id = $1`, [id]))),
    ).toBe("forbidden");
  });
});

describe("shots", () => {
  let live: string;
  beforeEach(async () => {
    live = await makeNight(db, { crewId: crew, startedBy: maya, participants: [maya, theo], rollSize: 2 });
  });
  const insert = (u: string, night: string, author = u, status = "held") =>
    q(
      u,
      `insert into shots (night_id, author_id, media_key, taken_at, status) values ($1, $2, 'k', $3, $4) returning id`,
      [night, author, NOW, status],
    );

  it("participants shoot during the live night; others can't", async () => {
    expect(await code(insert(maya, live))).toBe("ok");
    expect(await code(insert(jules, live))).toBe("forbidden"); // crew member who didn't join
    expect(await code(insert(stranger, live))).toBe("forbidden");
  });
  it("can't shoot as someone else or insert pre-reviewed", async () => {
    expect(await code(insert(maya, live, theo))).toBe("forbidden");
    expect(await code(insert(maya, live, maya, "kept"))).toBe("forbidden");
  });
  it("the roll is enforced in the database", async () => {
    await insert(maya, live);
    await insert(maya, live);
    expect(await code(insert(maya, live))).toBe("roll_full"); // the locked trigger (0009) answers before RLS;
    expect(await code(insert(theo, live))).toBe("ok");
  });
  it("no shots after the night ends", async () => {
    const ended = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya],
      phase: "developing",
    });
    expect(await code(insert(maya, ended))).toBe("forbidden");
  });
  it("authors review (keep/toss) before the unlock; afterwards they can only delete", async () => {
    const dev = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo],
      phase: "developing",
    });
    const s = await makeShot(db, dev, maya);
    expect(
      (await q(maya, `update shots set status = 'discarded' where id = $1 returning id`, [s])).rows,
    ).toHaveLength(1);
    expect(
      (await q(maya, `update shots set status = 'kept' where id = $1 returning id`, [s])).rows,
    ).toHaveLength(1);
    expect(
      (await q(theo, `update shots set status = 'discarded' where id = $1 returning id`, [s])).rows,
    ).toEqual([]);
    await service(db, `update nights set unlocked_at = unlock_at where id = $1`, [dev]);
    expect(await code(q(maya, `update shots set status = 'discarded' where id = $1`, [s]))).toBe("forbidden");
    expect(await code(q(maya, `update shots set status = 'deleted' where id = $1`, [s]))).toBe("ok");
    expect(await code(service(db, `update shots set status = 'kept' where id = $1`, [s]))).toBe("forbidden"); // deleted is final
  });
  it("authors can't move a shot to another night or change its media", async () => {
    const s = await makeShot(db, live, maya);
    expect(await code(q(maya, `update shots set media_key = 'evil' where id = $1`, [s]))).toBe("forbidden");
  });
});

describe("consent: hides, tags, reports", () => {
  let night: string, shot: string;
  beforeEach(async () => {
    night = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo, jules],
      phase: "unlocked",
    });
    shot = await makeShot(db, night, maya);
  });

  it("a subject hides a shot: gone for everyone but the author, who sees 'hidden'", async () => {
    await q(theo, `insert into shot_hides (shot_id, user_id) values ($1, $2)`, [shot, theo]);
    expect((await q(jules, `select id from shots where id = $1`, [shot])).rows).toEqual([]);
    expect(
      (await q(maya, `select shot_hidden_from_others(id) as h from shots where id = $1`, [shot])).rows,
    ).toEqual([{ h: true }]);
    // jules can't see who hid it, and the author can't see the hide row
    expect((await q(maya, `select * from shot_hides where shot_id = $1`, [shot])).rows).toEqual([]);
  });
  it("only the hider lifts a hide; authors can't hide their own; outsiders can't hide", async () => {
    await q(theo, `insert into shot_hides (shot_id, user_id) values ($1, $2)`, [shot, theo]);
    expect(
      (await q(maya, `delete from shot_hides where shot_id = $1 returning shot_id`, [shot])).rows,
    ).toEqual([]);
    expect(
      await code(q(maya, `insert into shot_hides (shot_id, user_id) values ($1, $2)`, [shot, maya])),
    ).toBe("forbidden");
    expect(await code(q(sam, `insert into shot_hides (shot_id, user_id) values ($1, $2)`, [shot, sam]))).toBe(
      "forbidden",
    );
    expect(
      (await q(theo, `delete from shot_hides where shot_id = $1 returning shot_id`, [shot])).rows,
    ).toHaveLength(1);
    expect((await q(jules, `select id from shots where id = $1`, [shot])).rows).toHaveLength(1);
  });
  it("pending tags are visible only to subject and tagger; subjects decide", async () => {
    await q(
      maya,
      `insert into shot_tags (shot_id, subject_id, tagger_id, status) values ($1, $2, $3, 'pending')`,
      [shot, theo, maya],
    );
    expect((await q(jules, `select * from shot_tags where shot_id = $1`, [shot])).rows).toEqual([]);
    expect((await q(theo, `select status from shot_tags where shot_id = $1`, [shot])).rows).toEqual([
      { status: "pending" },
    ]);
    expect(
      (await q(maya, `update shot_tags set status = 'approved' where shot_id = $1 returning status`, [shot]))
        .rows,
    ).toEqual([]);
    await q(theo, `update shot_tags set status = 'approved' where shot_id = $1`, [shot]);
    expect((await q(jules, `select status from shot_tags where shot_id = $1`, [shot])).rows).toEqual([
      { status: "approved" },
    ]);
    await q(theo, `update shot_tags set status = 'removed' where shot_id = $1`, [shot]);
    expect(await code(q(theo, `update shot_tags set status = 'approved' where shot_id = $1`, [shot]))).toBe(
      "forbidden",
    );
  });
  it("tags: no spoofing the tagger, self-tags are approved, no tagging outsiders or blocked people", async () => {
    expect(
      await code(
        q(maya, `insert into shot_tags (shot_id, subject_id, tagger_id) values ($1, $2, $3)`, [
          shot,
          theo,
          jules,
        ]),
      ),
    ).toBe("forbidden");
    expect(
      await code(
        q(
          theo,
          `insert into shot_tags (shot_id, subject_id, tagger_id, status) values ($1, $2, $2, 'pending')`,
          [shot, theo],
        ),
      ),
    ).toBe("forbidden");
    expect(
      await code(
        q(
          theo,
          `insert into shot_tags (shot_id, subject_id, tagger_id, status) values ($1, $2, $2, 'approved')`,
          [shot, theo],
        ),
      ),
    ).toBe("ok");
    expect(
      await code(
        q(maya, `insert into shot_tags (shot_id, subject_id, tagger_id) values ($1, $2, $3)`, [
          shot,
          sam,
          maya,
        ]),
      ),
    ).toBe("forbidden");
    await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [jules, maya]);
    expect(
      await code(
        q(maya, `insert into shot_tags (shot_id, subject_id, tagger_id) values ($1, $2, $3)`, [
          shot,
          jules,
          maya,
        ]),
      ),
    ).toBe("forbidden");
  });
  it("subject-category reports hide for everyone; other reports don't", async () => {
    await as(theo, (tx) => tx.query(`select report_shot($1, 'harassment', 'mean caption', $2)`, [shot, NOW]));
    expect((await q(jules, `select id from shots where id = $1`, [shot])).rows).toHaveLength(1);
    await as(theo, (tx) => tx.query(`select report_shot($1, 'in_photo', null, $2)`, [shot, NOW]));
    expect((await q(jules, `select id from shots where id = $1`, [shot])).rows).toEqual([]);
    expect((await q(theo, `select reason from reports order by created_at`)).rows).toHaveLength(2);
    expect((await q(maya, `select * from reports`)).rows).toEqual([]);
    expect(
      await code(as(sam, (tx) => tx.query(`select report_shot($1, 'nudity', null, $2)`, [shot, NOW]))),
    ).toBe("not_found");
  });
});

describe("reactions and blocks", () => {
  it("react only to shots you can see, with the fixed set", async () => {
    const locked = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo],
      phase: "developing",
    });
    const s1 = await makeShot(db, locked, maya);
    expect(
      await code(
        q(theo, `insert into reactions (shot_id, user_id, emoji) values ($1, $2, '🔥')`, [s1, theo]),
      ),
    ).toBe("forbidden");
    const open = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo],
      phase: "unlocked",
    });
    const s2 = await makeShot(db, open, maya);
    expect(
      await code(
        q(theo, `insert into reactions (shot_id, user_id, emoji) values ($1, $2, '🔥')`, [s2, theo]),
      ),
    ).toBe("ok");
    expect(await code(q(theo, `update reactions set emoji = '💩' where shot_id = $1`, [s2]))).toBe("invalid");
    expect(
      await code(
        q(theo, `insert into reactions (shot_id, user_id, emoji) values ($1, $2, '😂')`, [s2, maya]),
      ),
    ).toBe("forbidden");
  });
  it("blocks are private to the blocker and hide the blocked person from participant lists", async () => {
    const open = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo, jules],
      phase: "unlocked",
    });
    await q(theo, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [theo, jules]);
    expect((await q(jules, `select * from blocks`)).rows).toEqual([]);
    expect(
      await code(q(theo, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [jules, maya])),
    ).toBe("forbidden");
    const seenByTheo = await q(theo, `select user_id from night_participants($1)`, [open]);
    expect(seenByTheo.rows.map((r) => (r as { user_id: string }).user_id).sort()).toEqual(
      [maya, theo].sort(),
    );
    const seenByJules = await q(jules, `select user_id from night_members where night_id = $1`, [open]);
    expect(seenByJules.rows.map((r) => (r as { user_id: string }).user_id).sort()).toEqual(
      [maya, jules].sort(),
    );
  });
  it("teaser counts exclude blocked authors and discarded shots", async () => {
    const live = await makeNight(db, { crewId: crew, startedBy: maya, participants: [maya, theo, jules] });
    await makeShot(db, live, theo);
    await makeShot(db, live, theo, { status: "discarded" });
    await makeShot(db, live, jules);
    await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [jules, maya]);
    const counts = await q(maya, `select user_id, shots from night_counts($1)`, [live]);
    const byUser = Object.fromEntries(
      counts.rows.map((r) => [(r as { user_id: string }).user_id, (r as { shots: number }).shots]),
    );
    expect(byUser).toEqual({ [maya]: 0, [theo]: 1 });
    expect((await q(stranger, `select * from night_counts($1)`, [live])).rows).toEqual([]);
  });
});

describe("invites", () => {
  const mk = (
    u: string,
    kind: string,
    target: string,
    token: string,
    expires: Date,
    max: number | null = null,
  ) =>
    as(u, (tx) =>
      tx.query(`select create_invite($1, $2, $3, $4, $5, $6) as id`, [
        kind,
        target,
        sha(token),
        expires,
        max,
        NOW,
      ]),
    );
  const redeem = (u: string, token: string, at = NOW) =>
    as(
      u,
      async (tx) =>
        (await tx.query<{ r: unknown }>(`select redeem_invite($1, $2) as r`, [sha(token), at])).rows[0]!.r,
    );
  const week = new Date(NOW.getTime() + 7 * 86_400_000);

  it("crew invites add you to the crew, once", async () => {
    await mk(maya, "crew", crew, "tok-crew-1", week);
    expect(await redeem(stranger, "tok-crew-1")).toEqual({ kind: "crew", crew_id: crew });
    expect(await redeem(stranger, "tok-crew-1")).toEqual({ kind: "crew", crew_id: crew });
    expect(
      (
        await q(stranger, `select role from crew_members where crew_id = $1 and user_id = $2`, [
          crew,
          stranger,
        ])
      ).rows,
    ).toEqual([{ role: "member" }]);
    expect(
      (await service(db, `select uses from invites where token_hash = $1`, [sha("tok-crew-1")])).rows,
    ).toEqual([{ uses: 1 }]);
  });
  it("only members create invites; expired, revoked and used-up invites fail", async () => {
    expect(await code(mk(stranger, "crew", crew, "nope", week))).toBe("not_member");
    await mk(maya, "crew", crew, "short", new Date(NOW.getTime() + 1000));
    expect(await code(redeem(stranger, "short", new Date(NOW.getTime() + 2000)))).toBe("expired");
    await mk(maya, "crew", crew, "once", week, 1);
    await redeem(stranger, "once");
    const other = await makeUser(db, "Other");
    expect(await code(redeem(other, "once"))).toBe("used_up");
    const id = ((await mk(maya, "crew", crew, "rev", week)).rows[0] as { id: string }).id;
    expect(await code(as(theo, (tx) => tx.query(`select revoke_invite($1, $2)`, [id, NOW])))).toBe(
      "not_found",
    );
    await as(maya, (tx) => tx.query(`select revoke_invite($1, $2)`, [id, NOW]));
    expect(await code(redeem(other, "rev"))).toBe("revoked");
    expect(await code(redeem(other, "never-made"))).toBe("invalid_invite");
  });
  it("night invites join the night; blocked creators make the invite invalid", async () => {
    const live = await makeNight(db, { crewId: crew, startedBy: maya, participants: [maya] });
    await mk(maya, "night", live, "tok-night", week);
    expect(await redeem(stranger, "tok-night")).toEqual({ kind: "night", night_id: live });
    const blocked = await makeUser(db, "Blocked");
    await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [maya, blocked]);
    expect(await code(redeem(blocked, "tok-night"))).toBe("invalid_invite");
  });
  it("invite token hashes are private to their creator", async () => {
    await mk(maya, "crew", crew, "secret", week);
    expect((await q(theo, `select * from invites`)).rows).toEqual([]);
    expect((await q(maya, `select * from invites`)).rows).toHaveLength(1);
  });
});

describe("ready + notifications", () => {
  it("mark_ready only while developing, only participants", async () => {
    const live = await makeNight(db, { crewId: crew, startedBy: maya, participants: [maya, theo] });
    expect(await code(as(maya, (tx) => tx.query(`select mark_ready($1, $2)`, [live, NOW])))).toBe(
      "not_developing",
    );
    const dev = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo],
      phase: "developing",
    });
    expect(await code(as(maya, (tx) => tx.query(`select mark_ready($1, $2)`, [dev, NOW])))).toBe("ok");
    expect(await code(as(jules, (tx) => tx.query(`select mark_ready($1, $2)`, [dev, NOW])))).toBe(
      "not_found",
    );
  });
  it("unlock notifies participants once; notifications are private", async () => {
    const dev = await makeNight(db, {
      crewId: crew,
      startedBy: maya,
      participants: [maya, theo],
      phase: "developing",
    });
    for (let k = 0; k < 2; k++)
      await asService(db, (tx) =>
        tx.query(`select apply_night_advance($1, null, $2, 'scheduled')`, [dev, NOW]),
      );
    expect((await q(theo, `select kind from notifications where kind = 'album_ready'`)).rows).toHaveLength(1);
    expect((await q(jules, `select kind from notifications where kind = 'album_ready'`)).rows).toEqual([]);
  });
});

describe("join codes are not an oracle (code review #4)", () => {
  it("valid and invalid codes fail the same way, and both count as attempts", async () => {
    const s = computeNightSchedule(NOW, "America/Chicago");
    await as(maya, (tx) =>
      tx.query(`select start_night($1, null, null, 'America/Chicago', $2, $3, $4, $5, '8642', 24)`, [
        crew,
        NOW,
        s.autoEndAt,
        s.unlockAt,
        s.earliestUnlockAt,
      ]),
    );
    const other = await makeCrew(db, stranger, [stranger], "Mine");
    await as(stranger, (tx) =>
      tx.query(`select start_night($1, null, null, 'America/Chicago', $2, $3, $4, $5, '1357', 24)`, [
        other,
        NOW,
        s.autoEndAt,
        s.unlockAt,
        s.earliestUnlockAt,
      ]),
    );
    // stranger is already in their own live night: a valid code and a wrong code look identical.
    const valid = await as(
      stranger,
      async (tx) =>
        (await tx.query<{ id: string | null }>(`select join_night_by_code('8642', $1) as id`, [NOW])).rows[0]!
          .id,
    );
    const wrong = await as(
      stranger,
      async (tx) =>
        (await tx.query<{ id: string | null }>(`select join_night_by_code('0001', $1) as id`, [NOW])).rows[0]!
          .id,
    );
    expect(valid).toBeNull();
    expect(wrong).toBeNull();
    const n = await service(db, `select count(*)::int as n from code_attempts where user_id = $1`, [
      stranger,
    ]);
    expect(n.rows[0]).toEqual({ n: 2 });
  });
});

describe("host-only RPCs refuse guests (NULL-safe, privacy review fix)", () => {
  it("a guest can't remove people, rotate the code, or mint night links", async () => {
    const live = await makeNight(db, { crewId: crew, startedBy: maya, participants: [maya, stranger] });
    expect(
      await code(as(stranger, (tx) => tx.query(`select remove_from_night($1, $2, $3)`, [live, maya, NOW]))),
    ).toBe("not_allowed");
    expect(
      await code(as(stranger, (tx) => tx.query(`select rotate_night_code($1, '9999', $2)`, [live, NOW]))),
    ).toBe("not_allowed");
    expect(
      await code(
        as(stranger, (tx) =>
          tx.query(`select create_invite('night', $1, $2, $3, 10, $4)`, [
            live,
            "a".repeat(64),
            new Date(NOW.getTime() + 3_600_000),
            NOW,
          ]),
        ),
      ),
    ).toBe("not_allowed");
    expect(
      await code(as(maya, (tx) => tx.query(`select remove_from_night($1, $2, $3)`, [live, stranger, NOW]))),
    ).toBe("ok");
  });
});

describe("night_bans (privacy round 2)", () => {
  it("removal is a ban: no rejoin by crew or code, and the code rotates", async () => {
    const s = computeNightSchedule(NOW, "America/Chicago");
    const id = await as(
      maya,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            `select start_night($1, null, null, 'America/Chicago', $2, $3, $4, $5, '2468', 24) as id`,
            [crew, NOW, s.autoEndAt, s.unlockAt, s.earliestUnlockAt],
          )
        ).rows[0]!.id,
    );
    await as(theo, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, NOW]));
    await as(maya, (tx) => tx.query(`select remove_from_night($1, $2, $3)`, [id, theo, NOW]));
    expect(
      (
        await service(db, `select count(*)::int as n from night_bans where night_id = $1 and user_id = $2`, [
          id,
          theo,
        ])
      ).rows[0],
    ).toEqual({ n: 1 });
    expect(await code(as(theo, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, NOW])))).toBe(
      "unavailable",
    );
    const now = (await service(db, `select join_code from nights where id = $1`, [id])).rows[0] as {
      join_code: string;
    };
    expect(now.join_code).not.toBe("2468");
    expect((await q(theo, `select id from nights where id = $1`, [id])).rows).toEqual([]);
    expect(await code(q(theo, `select * from night_bans`))).toBe("forbidden");
  });
});
