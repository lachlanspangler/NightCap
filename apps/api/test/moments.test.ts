import { describe, expect, it } from "vitest";
import { service } from "@nightcap/db";
import { photoForm, testApp, type TestApp } from "./helpers";

async function longDistance(t: TestApp, names: string[]) {
  const users = [];
  for (const n of names) users.push(await t.user(n));
  const crew = (
    await t.req("POST", "/crews", {
      token: users[0]!.token,
      json: { name: "Carleton '22", kind: "long_distance" },
    })
  ).body.crew;
  for (const u of users.slice(1)) {
    const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: users[0]!.token })).body;
    await t.req("POST", "/invites/redeem", { token: u.token, json: { token: inv.token } });
  }
  return { users, crew };
}

describe("weekly Nightcap moments", () => {
  it("opens Friday 9pm, one shot each, reveals when everyone's in", async () => {
    const t = await testApp(); // Fri 21:00 CDT → the default window is open
    const { users, crew } = await longDistance(t, ["Maya", "Theo", "Priya"]);
    const m = (await t.req("GET", `/crews/${crew.id}/moment`, { token: users[0]!.token })).body;
    expect(m.window.isOpen).toBe(true);
    expect(m.open).toMatchObject({ kind: "moment", phase: "live", rollSize: 1 });
    expect(m.open.participants).toHaveLength(3);
    const night = m.open.id;
    expect(
      (await t.req("POST", `/nights/${night}/shots`, { token: users[0]!.token, form: photoForm() })).status,
    ).toBe(201);
    expect(
      (await t.req("POST", `/nights/${night}/shots`, { token: users[0]!.token, form: photoForm() })).body
        .error,
    ).toBe("roll_full");
    expect((await t.req("GET", `/nights/${night}`, { token: users[1]!.token })).body.night.shots).toEqual([]);
    await t.req("POST", `/nights/${night}/shots`, { token: users[1]!.token, form: photoForm() });
    await t.req("POST", `/nights/${night}/shots`, { token: users[2]!.token, form: photoForm() });
    const done = (await t.req("GET", `/nights/${night}`, { token: users[1]!.token })).body.night;
    expect(done).toMatchObject({ phase: "unlocked", unlockReason: "everyone_posted" });
    expect(done.shots).toHaveLength(3);
    // Idempotent: the same window doesn't create a second night.
    const again = (await t.req("GET", `/crews/${crew.id}/moment`, { token: users[2]!.token })).body;
    expect(again.open?.id ?? again.last?.id).toBe(night);
  });
  it("reveals at the window close if someone sat it out", async () => {
    const t = await testApp();
    const { users, crew } = await longDistance(t, ["Maya", "Theo"]);
    const night = (await t.req("GET", `/crews/${crew.id}/moment`, { token: users[0]!.token })).body.open.id;
    await t.req("POST", `/nights/${night}/shots`, { token: users[0]!.token, form: photoForm() });
    t.clock.advance(2 * 3_600_000 + 1000);
    expect((await t.req("GET", `/nights/${night}`, { token: users[1]!.token })).body.night).toMatchObject({
      phase: "unlocked",
      unlockReason: "window_closed",
    });
  });
  it("owners set the schedule; anyone sets the reunion countdown", async () => {
    const t = await testApp();
    const { users, crew } = await longDistance(t, ["Maya", "Theo"]);
    expect(
      (
        await t.req("PATCH", `/crews/${crew.id}`, {
          token: users[1]!.token,
          json: { moment: { weekday: 0, hour: 19, minute: 30, durationMinutes: 90 } },
        })
      ).status,
    ).toBe(403);
    const r = await t.req("PATCH", `/crews/${crew.id}`, {
      token: users[0]!.token,
      json: { moment: { weekday: 0, hour: 19, minute: 30, durationMinutes: 90 } },
    });
    expect(r.body.crew.moment.label).toBe("Sundays at 7:30pm · 90m window");
    const reunion = await t.req("PATCH", `/crews/${crew.id}`, {
      token: users[1]!.token,
      json: { reunionLabel: "Lake house", reunionAt: "2026-11-20T18:00:00.000Z" },
    });
    expect(reunion.body.crew.reunion).toEqual({ label: "Lake house", at: "2026-11-20T18:00:00.000Z" });
  });
});

describe("recaps and nudges on the demo world", () => {
  it("on this night, month in review, and a gentle nudge about the quiet friend", async () => {
    const t = await testApp({ now: "2026-10-28T17:00:00Z" });
    await t.req("POST", "/dev/reseed");
    const maya = (
      await t.req("POST", "/dev/login", { json: { userId: "11111111-1111-4111-8111-111111111111" } })
    ).body.token;
    const crews = (await t.req("GET", "/crews", { token: maya })).body.crews;
    const owls = crews.find((c: { name: string }) => c.name === "Night Owls");
    const r = (await t.req("GET", `/crews/${owls.id}/recaps`, { token: maya })).body;
    expect(r.onThisNight).toEqual([expect.objectContaining({ title: "Dinkytown, the legend", yearsAgo: 1 })]);
    expect(r.onThisNight[0].coverUrl).toMatch(/^\/media\//);
    expect(r.thisMonth.nights + r.lastMonth.nights).toBeGreaterThanOrEqual(2);
    expect(r.thisMonth.label).toMatch(/with Night Owls/);
    const college = crews.find((c: { kind: string }) => c.kind === "long_distance");
    await t.req("GET", `/crews/${college.id}/moment`, { token: maya });
    const sent = await service(
      t.db,
      `select p.display_name as about from nudges_sent n join profiles p on p.id = n.about_user_id where n.kind = 'quiet_friend'`,
    );
    expect(sent.rows).toEqual([{ about: "Devin" }]);
    const inbox = (await t.req("GET", "/me/notifications", { token: maya })).body.notifications;
    const nudges = inbox.filter((n: { kind: string }) => n.kind === "nudge");
    if (nudges.length) expect(nudges[0].payload.text).toMatch(/Devin hasn't been in a Nightcap/);
  });
});
