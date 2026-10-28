import { describe, expect, it } from "vitest";
import { service } from "@nightcap/db";
import { photoForm, testApp, type TestApp } from "./helpers";

async function cityReady(t: TestApp, name: string, gender = "unspecified") {
  const u = await t.user(name);
  await t.req("PATCH", "/me", { token: u.token, json: { gender, funLine: `${name} likes trivia` } });
  await t.req("POST", "/city/join", {
    token: u.token,
    json: { city: "minneapolis", acceptCodeOfConduct: true },
  });
  await t.req("POST", "/me/verify-age", { token: u.token });
  return u;
}

async function event(t: TestApp, startsInHours: number, min = 4, max = 6) {
  const r = await service(
    t.db,
    `insert into city_events (city, title, theme, venue_name, venue_area, starts_at, table_min, table_max) values ('minneapolis', 'Trivia Table', 'trivia', 'The Nook', 'St. Paul', $1, $2, $3) returning id`,
    [new Date(t.deps.clock.now().getTime() + startsInHours * 3_600_000), min, max],
  );
  return (r.rows[0] as { id: string }).id;
}

describe("City Nights", () => {
  it("is gated: opt-in, code of conduct, 21+ verified", async () => {
    const t = await testApp();
    const u = await t.user("Newbie");
    const id = await event(t, 24);
    expect((await t.req("GET", "/city", { token: u.token })).body).toMatchObject({
      gate: { ok: false, missing: "not_opted_in" },
      events: [],
    });
    expect((await t.req("POST", `/city/events/${id}/signup`, { token: u.token, json: {} })).status).toBe(403);
    expect(
      (await t.req("POST", "/city/join", { token: u.token, json: { city: "minneapolis" } })).status,
    ).toBe(422);
    await t.req("POST", "/city/join", {
      token: u.token,
      json: { city: "minneapolis", acceptCodeOfConduct: true },
    });
    expect((await t.req("GET", "/city", { token: u.token })).body.gate).toEqual({
      ok: false,
      missing: "not_verified",
    });
    await t.req("POST", "/me/verify-age", { token: u.token });
    const ok = (await t.req("GET", "/city", { token: u.token })).body;
    expect(ok.gate).toEqual({ ok: true });
    expect(ok.events).toHaveLength(1);
    expect(ok.codeOfConduct).toHaveLength(4);
  });

  it("before the reveal you see a count, never names; at the reveal you get a table + a shared roll", async () => {
    const t = await testApp();
    const id = await event(t, 5);
    const people = [];
    for (const [n, g] of [
      ["Ava", "woman"],
      ["Noah", "man"],
      ["Lena", "woman"],
      ["Marcus", "man"],
      ["Zoe", "woman"],
      ["Eli", "man"],
    ] as const)
      people.push(await cityReady(t, n, g));
    for (const p of people)
      expect((await t.req("POST", `/city/events/${id}/signup`, { token: p.token, json: {} })).status).toBe(
        201,
      );
    const before = (await t.req("GET", `/city/events/${id}`, { token: people[0]!.token })).body.event;
    expect(before).toMatchObject({ signedUp: true, count: 6, revealed: false, table: null });
    expect(JSON.stringify(before)).not.toMatch(/Noah|Lena/);
    // A stranger who isn't at the table can't see anyone's profile.
    expect((await service(t.db, `select count(*)::int as n from city_tables`)).rows[0]).toEqual({ n: 0 });

    t.clock.advance(3.5 * 3_600_000); // 1.5h before start → revealed
    const after = (await t.req("GET", `/city/events/${id}`, { token: people[0]!.token })).body.event;
    expect(after.revealed).toBe(true);
    expect(after.table.people).toHaveLength(6);
    expect(after.table.people.find((p: { me: boolean }) => !p.me).funLine).toMatch(/likes trivia/);
    expect(after.table.nightId).toBeTruthy();
    // The table's roll is a real night: hold until morning applies.
    const night = (await t.req("GET", `/nights/${after.table.nightId}`, { token: people[1]!.token })).body
      .night;
    expect(night).toMatchObject({ kind: "city", phase: "live", code: null });
  });

  it("blocked people are never seated together; signups after forming are closed", async () => {
    const t = await testApp();
    const id = await event(t, 5, 2, 4);
    const [a, b, c, d] = [
      await cityReady(t, "A"),
      await cityReady(t, "B"),
      await cityReady(t, "C"),
      await cityReady(t, "D"),
    ];
    await t.req("POST", "/blocks", { token: a!.token, json: { userId: b!.id } });
    for (const p of [a, b, c, d])
      await t.req("POST", `/city/events/${id}/signup`, { token: p!.token, json: {} });
    t.clock.advance(3.5 * 3_600_000);
    const ta = (await t.req("GET", `/city/events/${id}`, { token: a!.token })).body.event.table;
    expect(ta.people.map((p: { id: string }) => p.id)).not.toContain(b!.id);
    const late = await cityReady(t, "Late");
    expect((await t.req("POST", `/city/events/${id}/signup`, { token: late.token, json: {} })).status).toBe(
      403,
    );
  });

  it("keep in touch opens contact only on a mutual yes; a no is invisible", async () => {
    const t = await testApp();
    const id = await event(t, 5);
    const ps = [];
    for (const n of ["Ava", "Noah", "Lena", "Marcus"]) ps.push(await cityReady(t, n));
    for (const p of ps) await t.req("POST", `/city/events/${id}/signup`, { token: p.token, json: {} });
    t.clock.advance(3.5 * 3_600_000);
    await t.req("GET", `/city/events/${id}`, { token: ps[0]!.token }); // reveal → forms tables
    const [ava, noah, lena] = ps as Awaited<ReturnType<TestApp["user"]>>[];
    expect(
      (
        await t.req("POST", `/city/events/${id}/keep-in-touch`, {
          token: ava!.token,
          json: { userId: noah!.id, yes: true },
        })
      ).body.matched,
    ).toBe(false);
    expect(
      (
        await t.req("POST", `/city/events/${id}/keep-in-touch`, {
          token: noah!.token,
          json: { userId: ava!.id, yes: true },
        })
      ).body.matched,
    ).toBe(true);
    await t.req("POST", `/city/events/${id}/keep-in-touch`, {
      token: ava!.token,
      json: { userId: lena!.id, yes: true },
    });
    await t.req("POST", `/city/events/${id}/keep-in-touch`, {
      token: lena!.token,
      json: { userId: ava!.id, yes: false },
    });
    expect(
      (await t.req("GET", "/city/connections", { token: ava!.token })).body.connections.map(
        (c: { name: string }) => c.name,
      ),
    ).toEqual(["Noah"]);
    expect((await t.req("GET", "/city/connections", { token: lena!.token })).body.connections).toEqual([]);
    // Can't "keep in touch" with someone who wasn't at your table.
    const outsider = await cityReady(t, "Outsider");
    expect(
      (
        await t.req("POST", `/city/events/${id}/keep-in-touch`, {
          token: ava!.token,
          json: { userId: outsider.id, yes: true },
        })
      ).status,
    ).toBe(403);
  });

  it("crewmates sit together only when invited, and never across a block", async () => {
    const t = await testApp();
    const id = await event(t, 5, 3, 4);
    const a = await cityReady(t, "A");
    const b = await cityReady(t, "B");
    const x = await cityReady(t, "X");
    const crew = (await t.req("POST", "/crews", { token: a.token, json: { name: "Trio" } })).body.crew;
    for (const u of [b, x]) {
      const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: a.token })).body;
      await t.req("POST", "/invites/redeem", { token: u.token, json: { token: inv.token } });
    }
    const others = [
      await cityReady(t, "C"),
      await cityReady(t, "D"),
      await cityReady(t, "E"),
      await cityReady(t, "F"),
    ];
    // Not signed up yet / not invited: the same generic 404.
    expect(
      (await t.req("POST", `/city/events/${id}/signup`, { token: b.token, json: { withUserId: a.id } }))
        .status,
    ).toBe(404);
    await t.req("POST", `/city/events/${id}/signup`, { token: a.token, json: { inviteFriendIds: [b.id] } });
    expect(
      (await t.req("POST", `/city/events/${id}/signup`, { token: x.token, json: { withUserId: a.id } }))
        .status,
    ).toBe(404); // crewmate, but not invited
    expect(
      (await t.req("POST", `/city/events/${id}/signup`, { token: b.token, json: { withUserId: a.id } }))
        .status,
    ).toBe(201);
    for (const o of others) await t.req("POST", `/city/events/${id}/signup`, { token: o.token, json: {} });
    t.clock.advance(3.5 * 3_600_000);
    const table = (await t.req("GET", `/city/events/${id}`, { token: a.token })).body.event.table;
    expect(table.people.map((p: { id: string }) => p.id)).toContain(b.id);
  });

  it("an invited friend who is blocked can't join the group", async () => {
    const t = await testApp();
    const id = await event(t, 5, 2, 4);
    const a = await cityReady(t, "A");
    const b = await cityReady(t, "B");
    const crew = (await t.req("POST", "/crews", { token: a.token, json: { name: "Duo" } })).body.crew;
    const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: a.token })).body;
    await t.req("POST", "/invites/redeem", { token: b.token, json: { token: inv.token } });
    await t.req("POST", `/city/events/${id}/signup`, { token: a.token, json: { inviteFriendIds: [b.id] } });
    await t.req("POST", "/blocks", { token: a.token, json: { userId: b.id } });
    expect(
      (await t.req("POST", `/city/events/${id}/signup`, { token: b.token, json: { withUserId: a.id } }))
        .status,
    ).toBe(404);
  });
});

describe("leaving a City table (code review #6)", () => {
  it("removes you from the table, its names and its roll", async () => {
    const t = await testApp();
    const id = await event(t, 5);
    const ps = [];
    for (const n of ["Ava", "Noah", "Lena", "Marcus"]) ps.push(await cityReady(t, n));
    for (const p of ps) await t.req("POST", `/city/events/${id}/signup`, { token: p.token, json: {} });
    t.clock.advance(3.5 * 3_600_000);
    const table = (await t.req("GET", `/city/events/${id}`, { token: ps[0]!.token })).body.event.table;
    await t.req("POST", `/nights/${table.nightId}/shots`, { token: ps[0]!.token, form: photoForm() });
    // Photos leave too only when asked (privacy review M2: leaving is instant, photo removal deliberate).
    await t.req("POST", `/city/tables/${table.id}/leave`, {
      token: ps[0]!.token,
      json: { removePhotos: true },
    });
    const after = (await t.req("GET", `/city/events/${id}`, { token: ps[0]!.token })).body.event;
    expect(after.table).toBeNull();
    expect((await t.req("GET", `/nights/${table.nightId}`, { token: ps[0]!.token })).status).toBe(404);
    expect(
      (
        await t.req("POST", `/city/events/${id}/keep-in-touch`, {
          token: ps[0]!.token,
          json: { userId: ps[1]!.id, yes: true },
        })
      ).status,
    ).toBe(403);
    const mates = (await t.req("GET", `/city/events/${id}`, { token: ps[1]!.token })).body.event.table.people;
    expect(mates.map((m: { id: string }) => m.id)).not.toContain(ps[0]!.id);
    // R2-3: their photos left with them.
    t.clock.set(new Date(t.deps.clock.now().getTime() + 30 * 3_600_000));
    expect(
      (await t.req("GET", `/nights/${table.nightId}`, { token: ps[1]!.token })).body.night.shots,
    ).toEqual([]);
    expect(t.media.files.size).toBe(0);
  });
});
