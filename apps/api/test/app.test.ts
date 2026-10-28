import { describe, expect, it } from "vitest";
import { service } from "@nightcap/db";
import { photoForm, testApp, type TestApp } from "./helpers";

const HOUR = 3_600_000;

async function crewWith(t: TestApp, names: string[]) {
  const users = [];
  for (const n of names) users.push(await t.user(n));
  const owner = users[0]!;
  const crew = (
    await t.req("POST", "/crews", { token: owner.token, json: { name: "Night Owls", emoji: "🦉" } })
  ).body.crew;
  for (const u of users.slice(1)) {
    const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: owner.token })).body;
    expect(
      (await t.req("POST", "/invites/redeem", { token: u.token, json: { token: inv.links.app } })).status,
    ).toBe(200);
  }
  return { users, crew };
}

describe("basics", () => {
  it("health is public; everything else needs a token", async () => {
    const t = await testApp();
    expect((await t.req("GET", "/health")).body).toMatchObject({ ok: true, mode: "mock" });
    expect((await t.req("GET", "/crews")).status).toBe(401);
    expect((await t.req("GET", "/crews", { token: "garbage" })).status).toBe(401);
  });
  it("dev routes exist only in mock mode", async () => {
    const mock = await testApp();
    expect((await mock.req("GET", "/dev/users")).status).toBe(200);
    const prod = await testApp({ mode: "prod" });
    const u = await prod.user("Maya");
    expect((await prod.req("GET", "/dev/users")).status).toBe(401);
    expect((await prod.req("GET", "/dev/users", { token: u.token })).status).toBe(404);
    expect((await prod.req("POST", "/dev/clock", { token: u.token, json: { jump: "morning" } })).status).toBe(
      404,
    );
  });
  it("signup enforces 21+ and returns no birthdate anywhere", async () => {
    const t = await testApp();
    expect(
      (await t.req("POST", "/dev/signup", { json: { name: "Kid", birthdate: "2007-01-01" } })).body,
    ).toMatchObject({ error: "under_21", message: "NightCap is for 21+." });
    expect(
      (await t.req("POST", "/dev/signup", { json: { name: "X", birthdate: "31/12/1990" } })).status,
    ).toBe(422);
    const ok = await t.req("POST", "/dev/signup", { json: { name: "Alex", birthdate: "2000-02-29" } });
    expect(ok.status).toBe(201);
    const me = await t.req("GET", "/me", { token: ok.body.token });
    expect(me.body).toMatchObject({ name: "Alex", is21: true, ageVerified: false });
    expect(JSON.stringify(me.body)).not.toMatch(/birth|2000-02-29/);
  });
  it("validation errors are 422 with issues; unknown ids 404", async () => {
    const t = await testApp();
    const u = await t.user("Maya");
    expect((await t.req("POST", "/crews", { token: u.token, json: { name: "" } })).status).toBe(422);
    expect((await t.req("GET", "/nights/not-a-uuid", { token: u.token })).status).toBe(404);
    expect((await t.req("PATCH", "/me", { token: u.token, json: { birthdate: "1990-01-01" } })).status).toBe(
      422,
    );
  });
});

describe("the core loop: crew → night → shared roll → morning unlock", () => {
  it("works end to end, with the sober check and an early reveal", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users as [
      Awaited<ReturnType<TestApp["user"]>>,
      Awaited<ReturnType<TestApp["user"]>>,
      Awaited<ReturnType<TestApp["user"]>>,
    ];

    // Start: one tap from the crew. Crew gets notified.
    const started = await t.req("POST", `/crews/${crew.id}/nights`, {
      token: maya.token,
      json: { title: "Halloween" },
    });
    expect(started.status).toBe(201);
    const night = started.body.night;
    expect(night).toMatchObject({
      phase: "live",
      rollSize: 24,
      unlockAtLabel: "10:00 AM",
      me: { shotsLeft: 24, canEnd: true },
    });
    expect(night.code).toMatch(/^\d{4}$/);
    const theoInbox = await t.req("GET", "/me/notifications", { token: theo.token });
    expect(theoInbox.body.notifications[0]).toMatchObject({ kind: "night_started" });

    // Theo joins from the crew; Jules joins with the code.
    expect((await t.req("POST", `/nights/${night.id}/join`, { token: theo.token })).status).toBe(200);
    expect(
      (
        await t.req("POST", "/nights/join", {
          token: jules.token,
          json: { code: ` ${night.code.slice(0, 2)} ${night.code.slice(2)} ` },
        })
      ).status,
    ).toBe(200);

    // Everyone snaps. Nobody sees anyone else's shots, only counts.
    for (const u of [maya, theo, theo, jules])
      expect(
        (await t.req("POST", `/nights/${night.id}/shots`, { token: u.token, form: photoForm() })).status,
      ).toBe(201);
    const live = (await t.req("GET", `/nights/${night.id}`, { token: maya.token })).body.night;
    expect(live.shots).toHaveLength(1);
    expect(live.shots[0].mine).toBe(true);
    expect(live.total).toBe(4);
    expect(live.participants.map((p: { name: string; shots: number }) => `${p.name}:${p.shots}`)).toEqual([
      "Maya:1",
      "Theo:2",
      "Jules:1",
    ]);
    expect(live.me.shotsLeft).toBe(23);

    // The stored file has no GPS.
    const stored = [...t.media.files.values()].map((b) => Buffer.from(b).toString("latin1"));
    expect(stored.length).toBe(4);
    for (const s of stored) expect(s).not.toContain("GPSLatitude");

    // 2am: Theo ends it? Not allowed (Maya started it). Maya ends it.
    expect((await t.req("POST", `/nights/${night.id}/end`, { token: theo.token })).status).toBe(403);
    t.clock.advance(5 * HOUR); // 02:00 CDT
    expect((await t.req("POST", `/nights/${night.id}/end`, { token: maya.token })).body.night.phase).toBe(
      "developing",
    );
    expect(
      (await t.req("POST", `/nights/${night.id}/shots`, { token: maya.token, form: photoForm() })).status,
    ).toBe(409);

    // Sober check: an "I'm good" at 2am doesn't count.
    const early = await t.req("POST", `/nights/${night.id}/ready`, { token: maya.token });
    expect(early.status).toBe(425);
    expect(early.body).toMatchObject({ error: "too_early", countsFrom: "2026-10-31T12:00:00.000Z" });

    // Morning review: Theo tosses one of his.
    const theoView = (await t.req("GET", `/nights/${night.id}`, { token: theo.token })).body.night;
    expect(
      (
        await t.req("PATCH", `/shots/${theoView.shots[0].id}`, {
          token: theo.token,
          json: { status: "discarded" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.req("PATCH", `/shots/${theoView.shots[0].id}`, {
          token: maya.token,
          json: { status: "kept" },
        })
      ).status,
    ).toBe(404);

    // 7:30am: everyone taps "I'm good" → it develops early.
    t.clock.set("2026-10-31T12:30:00Z");
    for (const u of [maya, theo])
      expect((await t.req("POST", `/nights/${night.id}/ready`, { token: u.token })).body.night.phase).toBe(
        "developing",
      );
    const last = await t.req("POST", `/nights/${night.id}/ready`, { token: jules.token });
    expect(last.body.night).toMatchObject({ phase: "unlocked", unlockReason: "everyone_ready" });

    // Everyone sees the whole night (minus the tossed one), in time order, with who took each.
    const album = (await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night;
    expect(album.shots).toHaveLength(3);
    expect(new Set(album.shots.map((s: { authorId: string }) => s.authorId))).toEqual(
      new Set([maya.id, theo.id, jules.id]),
    );
    const img = await t.req("GET", album.shots[0].url);
    expect(img.status).toBe(200);
    expect(img.body).toBeInstanceOf(Uint8Array);
    // Discarded media is deleted at the unlock.
    expect(t.media.files.size).toBe(3);
    const inbox = await t.req("GET", "/me/notifications", { token: jules.token });
    expect(inbox.body.notifications.map((n: { kind: string }) => n.kind)).toContain("album_ready");
  });

  it("unlocks at 10am on schedule even if nobody reviewed, and auto-ends at 5am", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya", "Theo"]);
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    await t.req("POST", `/nights/${night.id}/join`, { token: users[1]!.token });
    await t.req("POST", `/nights/${night.id}/shots`, { token: users[1]!.token, form: photoForm() });
    t.clock.set("2026-10-31T10:30:00Z"); // 05:30
    expect((await t.req("GET", `/nights/${night.id}`, { token: users[0]!.token })).body.night.phase).toBe(
      "developing",
    );
    t.clock.set("2026-10-31T15:00:30Z"); // 10:00
    const v = (await t.req("GET", `/nights/${night.id}`, { token: users[0]!.token })).body.night;
    expect(v).toMatchObject({ phase: "unlocked", unlockReason: "scheduled" });
    expect(v.shots).toHaveLength(1);
  });

  it("the roll is 24 per person", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya"]);
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    for (let i = 0; i < 24; i++)
      expect(
        (await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: photoForm() }))
          .status,
      ).toBe(201);
    const full = await t.req("POST", `/nights/${night.id}/shots`, {
      token: users[0]!.token,
      form: photoForm(),
    });
    expect(full.body).toMatchObject({
      error: "roll_full",
      message: "Roll's full. You're in the moment now.",
    });
  });

  it("rejects non-images and missing files", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya"]);
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    expect(
      (
        await t.req("POST", `/nights/${night.id}/shots`, {
          token: users[0]!.token,
          form: photoForm(new TextEncoder().encode("<svg onload=alert(1)>")),
        })
      ).status,
    ).toBe(415);
    expect(
      (await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: new FormData() }))
        .status,
    ).toBe(422);
    expect(t.media.files.size).toBe(0);
  });

  it("outsiders can't see, join without a code, or upload", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya"]);
    const stranger = await t.user("Stranger");
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    expect((await t.req("GET", `/nights/${night.id}`, { token: stranger.token })).status).toBe(404);
    expect((await t.req("POST", `/nights/${night.id}/join`, { token: stranger.token })).status).toBe(403);
    expect(
      (await t.req("POST", `/nights/${night.id}/shots`, { token: stranger.token, form: photoForm() })).status,
    ).toBe(404);
    expect((await t.req("GET", `/crews/${crew.id}`, { token: stranger.token })).status).toBe(404);
    expect(
      (await t.req("POST", "/nights/join", { token: stranger.token, json: { code: "12a4" } })).status,
    ).toBe(422);
  });
});

describe("sharing: invites, codes, QR links", () => {
  it("night invite links let a guest join that night only", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya", "Theo"]);
    const guest = await t.user("Sam");
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    const inv = (await t.req("POST", `/nights/${night.id}/invites`, { token: users[0]!.token })).body;
    expect(inv.links.web).toMatch(/^https:\/\/nightcap\.app\/j\//);
    expect(inv.code).toBe(night.code);
    const r = await t.req("POST", "/invites/redeem", { token: guest.token, json: { token: inv.links.web } });
    expect(r.body).toMatchObject({ kind: "night", nightId: night.id });
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: guest.token })).body.night.me.isParticipant,
    ).toBe(true);
    expect((await t.req("GET", `/crews/${crew.id}`, { token: guest.token })).status).toBe(404);
    // Night invites die with the night.
    t.clock.set("2026-10-31T11:00:00Z");
    const late = await t.user("Late");
    expect(
      (await t.req("POST", "/invites/redeem", { token: late.token, json: { token: inv.token } })).status,
    ).toBe(410);
  });
  it("wrong codes are rate-limited per account", async () => {
    const t = await testApp();
    const u = await t.user("Guesser");
    for (let i = 0; i < 10; i++)
      expect(
        (await t.req("POST", "/nights/join", { token: u.token, json: { code: String(1000 + i) } })).status,
      ).toBe(404);
    expect((await t.req("POST", "/nights/join", { token: u.token, json: { code: "4321" } })).status).toBe(
      429,
    );
  });
  it("bad invite tokens look the same as revoked ones (no oracle)", async () => {
    const t = await testApp();
    const u = await t.user("X");
    expect(
      (
        await t.req("POST", "/invites/redeem", {
          token: u.token,
          json: { token: "nightcap://join/AAAAAAAAAAAAAAAAAAAAAA" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await t.req("POST", "/invites/redeem", { token: u.token, json: { token: "<script>" } })).status,
    ).toBe(404);
  });
});

describe("consent & safety through the API", () => {
  async function unlockedNight() {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users as Awaited<ReturnType<TestApp["user"]>>[];
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: maya!.token, json: {} })).body
      .night;
    await t.req("POST", `/nights/${night.id}/join`, { token: theo!.token });
    await t.req("POST", `/nights/${night.id}/join`, { token: jules!.token });
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T15:01:00Z");
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    return { t, maya: maya!, theo: theo!, jules: jules!, night, shot, crew };
  }

  it("hide-me removes the shot for everyone but the author, and kills its media URL immediately", async () => {
    const { t, maya, theo, jules, night, shot } = await unlockedNight();
    const before = (await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots[0];
    expect((await t.req("GET", before.url)).status).toBe(200);
    expect((await t.req("POST", `/shots/${shot.id}/hide`, { token: theo.token })).status).toBe(200);
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots).toEqual([]);
    expect((await t.req("GET", before.url)).status).toBe(404); // URL still signed, but RLS re-check says no
    const mine = (await t.req("GET", `/nights/${night.id}`, { token: maya.token })).body.night.shots[0];
    expect(mine.hiddenFromOthers).toBe(true);
    expect((await t.req("POST", `/shots/${shot.id}/hide`, { token: maya.token })).body.error).toBe(
      "author_should_delete",
    );
    expect((await t.req("DELETE", `/shots/${shot.id}/hide`, { token: theo.token })).status).toBe(200);
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots).toHaveLength(
      1,
    );
  });

  it("tags: pending until the subject decides; untag removes it for good", async () => {
    const { t, maya, theo, jules, night, shot } = await unlockedNight();
    expect(
      (await t.req("POST", `/shots/${shot.id}/tags`, { token: maya.token, json: { userId: theo.id } }))
        .status,
    ).toBe(201);
    expect((await t.req("GET", "/me/tags", { token: theo.token })).body.tags).toHaveLength(1);
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots[0].tags,
    ).toEqual([]);
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: theo.token })).body.night.pendingTagsForMe,
    ).toHaveLength(1);
    await t.req("PATCH", `/shots/${shot.id}/tags/me`, { token: theo.token, json: { status: "approved" } });
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots[0].tags,
    ).toEqual([{ userId: theo.id, status: "approved" }]);
    await t.req("PATCH", `/shots/${shot.id}/tags/me`, { token: theo.token, json: { status: "removed" } });
    expect(
      (await t.req("POST", `/shots/${shot.id}/tags`, { token: jules.token, json: { userId: theo.id } })).body
        .error,
    ).toBe("subject_removed");
  });

  it("blocks are mutual invisibility and never deferred", async () => {
    const { t, maya, theo, night } = await unlockedNight();
    expect((await t.req("POST", "/blocks", { token: theo.token, json: { userId: maya.id } })).status).toBe(
      201,
    );
    const v = (await t.req("GET", `/nights/${night.id}`, { token: theo.token })).body.night;
    expect(v.shots).toEqual([]);
    expect(v.participants.map((p: { name: string }) => p.name)).not.toContain("Maya");
    expect((await t.req("GET", "/blocks", { token: theo.token })).body.blocks).toEqual([
      expect.objectContaining({ userId: maya.id, name: "Maya" }),
    ]);
    expect((await t.req("POST", "/blocks", { token: theo.token, json: { userId: theo.id } })).status).toBe(
      422,
    );
  });

  it("reports: subject categories auto-hide", async () => {
    const { t, theo, jules, night, shot } = await unlockedNight();
    expect(
      (await t.req("POST", `/shots/${shot.id}/report`, { token: theo.token, json: { reason: "in_photo" } }))
        .body,
    ).toMatchObject({ hidden: true });
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules.token })).body.night.shots).toEqual([]);
    expect(
      (await t.req("POST", `/shots/${shot.id}/report`, { token: theo.token, json: { reason: "spam" } }))
        .status,
    ).toBe(422);
  });

  it("reactions are the fixed five, on visible shots", async () => {
    const { t, theo, night, shot } = await unlockedNight();
    expect(
      (await t.req("PUT", `/shots/${shot.id}/reaction`, { token: theo.token, json: { emoji: "🔥" } })).status,
    ).toBe(200);
    expect(
      (await t.req("PUT", `/shots/${shot.id}/reaction`, { token: theo.token, json: { emoji: "💩" } })).status,
    ).toBe(422);
    const s = (await t.req("GET", `/nights/${night.id}`, { token: theo.token })).body.night.shots[0];
    expect(s).toMatchObject({ reactions: { "🔥": 1 }, myReaction: "🔥" });
  });

  it("after the unlock you can delete (media goes too), not un-toss", async () => {
    const { t, maya, shot } = await unlockedNight();
    expect(
      (await t.req("PATCH", `/shots/${shot.id}`, { token: maya.token, json: { status: "discarded" } }))
        .status,
    ).toBe(409);
    expect(t.media.files.size).toBe(1);
    expect((await t.req("DELETE", `/shots/${shot.id}`, { token: maya.token })).status).toBe(200);
    expect(t.media.files.size).toBe(0);
  });
});

describe("drunk-proof: ask me in the morning", () => {
  it("leaving a crew at night is deferred to 10am; by day it's immediate", async () => {
    const t = await testApp(); // Fri 21:00 local
    const { users, crew } = await crewWith(t, ["Maya", "Theo"]);
    const theo = users[1]!;
    const r = await t.req("DELETE", `/crews/${crew.id}/members/${theo.id}`, { token: theo.token });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ deferred: true, askAt: "2026-10-31T15:00:00.000Z" });
    expect((await t.req("GET", `/crews/${crew.id}`, { token: theo.token })).status).toBe(200);
    // Confirming while it's still night: refused.
    const d = (await t.req("GET", "/me/deferred", { token: theo.token })).body.deferred[0];
    expect(
      (await t.req("POST", `/me/deferred/${d.id}`, { token: theo.token, json: { confirm: true } })).status,
    ).toBe(425);
    // Morning: one tap.
    t.clock.set("2026-10-31T15:05:00Z");
    expect((await t.req("GET", "/me/deferred", { token: theo.token })).body.deferred[0].due).toBe(true);
    expect(
      (await t.req("POST", `/me/deferred/${d.id}`, { token: theo.token, json: { confirm: true } })).status,
    ).toBe(200);
    expect((await t.req("GET", `/crews/${crew.id}`, { token: theo.token })).status).toBe(404);
  });
  it("by day, the owner removes members immediately; members can't remove", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" }); // noon
    const { users, crew } = await crewWith(t, ["Maya", "Theo", "Jules"]);
    expect(
      (await t.req("DELETE", `/crews/${crew.id}/members/${users[2]!.id}`, { token: users[1]!.token })).status,
    ).toBe(403);
    expect(
      (await t.req("DELETE", `/crews/${crew.id}/members/${users[2]!.id}`, { token: users[0]!.token })).status,
    ).toBe(200);
  });
  it("account deletion wipes media and passes the crew on", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" });
    const { users, crew } = await crewWith(t, ["Maya", "Theo"]);
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: photoForm() });
    expect(t.media.files.size).toBe(1);
    // In a live night it's night mode → deferred. End the night, then it's immediate.
    expect((await t.req("DELETE", "/me", { token: users[0]!.token })).status).toBe(202);
    await t.req("POST", `/nights/${night.id}/end`, { token: users[0]!.token });
    expect((await t.req("DELETE", "/me", { token: users[0]!.token })).body).toMatchObject({ deleted: true });
    expect(t.media.files.size).toBe(0);
    const c = (await t.req("GET", `/crews/${crew.id}`, { token: users[1]!.token })).body.crew;
    expect(c.myRole).toBe("owner");
    expect(c.members).toHaveLength(1);
  });
});

describe("dev tools (mock mode)", () => {
  it("time travel + simulate drive a whole night", async () => {
    const t = await testApp();
    const { users, crew } = await crewWith(t, ["Maya", "Theo", "Jules"]);
    // demo ids aren't these users, so simulate won't act for them; it still advances safely
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    expect(
      (
        await t.req("POST", `/dev/nights/${night.id}/simulate`, {
          token: users[0]!.token,
          json: { shots: 2 },
        })
      ).status,
    ).toBe(200);
    const jump = await t.req("POST", "/dev/clock", { json: { jump: "unlock" } });
    expect(jump.body.local).toMatchObject({ hour: 10, minute: 0 });
    expect((await t.req("GET", `/nights/${night.id}`, { token: users[0]!.token })).body.night.phase).toBe(
      "unlocked",
    );
    expect((await t.req("POST", "/dev/clock", { json: { jump: "reset" } })).body.offsetMs).toBe(0);
  });
  it("seeds a demo world that only demo flags mark", async () => {
    const t = await testApp();
    const r = await t.req("POST", "/dev/reseed");
    expect(r.body.ok).toBe(true);
    const demo = await service(t.db, `select count(*)::int as n from profiles where is_demo`);
    expect((demo.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(6);
    const login = await t.req("POST", "/dev/login", {
      json: { userId: "11111111-1111-4111-8111-111111111111" },
    });
    const crews = (await t.req("GET", "/crews", { token: login.body.token })).body.crews;
    expect(crews.map((c: { name: string }) => c.name)).toEqual(["Night Owls", "Carleton '22"]);
    expect(crews[0].albums.length).toBeGreaterThanOrEqual(3);
    expect((await t.req("GET", "/me/tags", { token: login.body.token })).body.tags).toHaveLength(2);
  });
});

describe("hides outlive the hider", () => {
  it("a photo someone hid stays hidden after they delete their account", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" });
    const { users, crew } = await crewWith(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users as Awaited<ReturnType<TestApp["user"]>>[];
    t.clock.set("2026-10-31T02:00:00Z");
    const night = (await t.req("POST", `/crews/${crew.id}/nights`, { token: maya!.token, json: {} })).body
      .night;
    await t.req("POST", `/nights/${night.id}/join`, { token: theo!.token });
    await t.req("POST", `/nights/${night.id}/join`, { token: jules!.token });
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T17:00:00Z"); // noon: unlocked, day mode
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    await t.req("POST", `/shots/${shot.id}/hide`, { token: theo!.token });
    expect((await t.req("DELETE", "/me", { token: theo!.token })).body).toMatchObject({ deleted: true });
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules!.token })).body.night.shots).toEqual([]);
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: maya!.token })).body.night.shots[0]
        .hiddenFromOthers,
    ).toBe(true);
  });
});
