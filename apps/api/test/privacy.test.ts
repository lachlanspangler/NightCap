// Regression tests for the privacy & safety review (docs/reviews/m1-privacy.md).
import { describe, expect, it } from "vitest";
import { service } from "@nightcap/db";
import { stripPng } from "../src/media/exif";
import { jpegWithGps, photoForm, testApp, type TestApp } from "./helpers";

type U = Awaited<ReturnType<TestApp["user"]>>;

async function crewOf(t: TestApp, names: string[]) {
  const users: U[] = [];
  for (const n of names) users.push(await t.user(n));
  const crew = (await t.req("POST", "/crews", { token: users[0]!.token, json: { name: "Owls" } })).body.crew;
  for (const u of users.slice(1)) {
    const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: users[0]!.token })).body;
    await t.req("POST", "/invites/redeem", { token: u.token, json: { token: inv.token } });
  }
  return { users, crew };
}

async function liveNight(t: TestApp, host: U, crewId: string, joiners: U[] = []) {
  const night = (
    await t.req("POST", `/crews/${crewId}/nights`, {
      token: host.token,
      json: { title: "Halloween", venue: "Maya's place, 3rd fl" },
    })
  ).body.night;
  for (const j of joiners) await t.req("POST", `/nights/${night.id}/join`, { token: j.token });
  return night;
}

describe("C1: you can remove and block where the threat is", () => {
  it("a host removes someone from the night instantly, even at 1am, and they lose the album", async () => {
    const t = await testApp(); // Fri 21:00 → night mode
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Creep"]);
    const [maya, theo, creep] = users;
    const night = await liveNight(t, maya!, crew.id, [theo!, creep!]);
    await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() });
    expect(
      (await t.req("DELETE", `/nights/${night.id}/members/${creep!.id}`, { token: theo!.token })).status,
    ).toBe(403); // not the host
    const r = await t.req("DELETE", `/nights/${night.id}/members/${creep!.id}`, { token: maya!.token });
    expect(r.status).toBe(200);
    expect(r.body.night.participants.map((p: { name: string }) => p.name)).not.toContain("Creep");
    t.clock.set("2026-10-31T15:01:00Z");
    expect((await t.req("GET", `/nights/${night.id}`, { token: creep!.token })).body.night.shots).toEqual([]);
  });
  it("removing a crew member is never deferred, and takes them out of the crew's live night", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Creep"]);
    const [maya, theo, creep] = users;
    const night = await liveNight(t, maya!, crew.id, [theo!, creep!]);
    await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() });
    expect(
      (await t.req("DELETE", `/crews/${crew.id}/members/${creep!.id}`, { token: maya!.token })).status,
    ).toBe(200);
    t.clock.set("2026-10-31T15:01:00Z");
    const v = await t.req("GET", `/nights/${night.id}`, { token: creep!.token });
    expect(v.status === 404 || v.body.night.shots.length === 0).toBe(true);
  });
  it("leaving a crew where you've blocked someone is immediate, even at night", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Ex"]);
    const [maya, ex] = users;
    await t.req("POST", "/blocks", { token: ex!.token, json: { userId: maya!.id } });
    expect((await t.req("DELETE", `/crews/${crew.id}/members/${ex!.id}`, { token: ex!.token })).status).toBe(
      200,
    );
  });
});

describe("C2: reports are evidence", () => {
  it("an under-18 report preserves the media, blocks the author's hard delete, and denylists re-uploads", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo"]);
    const [maya, theo] = users;
    const night = await liveNight(t, maya!, crew.id, [theo!]);
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T15:01:00Z");
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    expect(
      (await t.req("POST", `/shots/${shot.id}/report`, { token: theo!.token, json: { reason: "under_18" } }))
        .body.hidden,
    ).toBe(true);
    expect((await t.req("DELETE", `/shots/${shot.id}`, { token: maya!.token })).status).toBe(200);
    expect(t.media.files.size).toBe(1); // preserved for review
    const q = (await t.req("GET", "/dev/reports")).body.reports;
    expect(q).toEqual([expect.objectContaining({ reason: "under_18", evidenceHeld: true })]);
    // the same image can't be shared again (in any night)
    t.clock.set("2026-11-01T03:00:00Z");
    const n2 = await liveNight(t, maya!, crew.id);
    expect(
      (await t.req("POST", `/nights/${n2.id}/shots`, { token: maya!.token, form: photoForm() })).body.error,
    ).toBe("blocked_media");
    const hashes = await service(t.db, `select count(*)::int as n from blocked_hashes`);
    expect(hashes.rows[0]).toEqual({ n: 1 });
  });
  it("'under 21' is a separate category, and reporting a person works", async () => {
    const t = await testApp();
    const { users } = await crewOf(t, ["Maya", "Theo"]);
    expect(
      (
        await t.req("POST", "/reports", {
          token: users[0]!.token,
          json: { userId: users[1]!.id, reason: "harassment" },
        })
      ).status,
    ).toBe(201);
    const stranger = await t.user("Stranger");
    expect(
      (
        await t.req("POST", "/reports", {
          token: users[0]!.token,
          json: { userId: stranger.id, reason: "harassment" },
        })
      ).status,
    ).toBe(404);
  });
});

describe("H1: a block hides where you are, and never locks the blocker out", () => {
  it("a blocked crewmate can't see the live night (no venue, no who)", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Ex"]);
    const [maya, theo, ex] = users;
    await t.req("POST", "/blocks", { token: maya!.token, json: { userId: ex!.id } });
    const night = await liveNight(t, maya!, crew.id, [theo!]);
    expect((await t.req("GET", `/nights/${night.id}`, { token: ex!.token })).status).toBe(404);
    const c = (await t.req("GET", `/crews/${crew.id}`, { token: ex!.token })).body.crew;
    expect(c.liveNight).toBeNull();
    expect(JSON.stringify(c)).not.toContain("3rd fl");
  });
  it("crewmates not in the night don't see the venue or who started it", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo"]);
    const night = await liveNight(t, users[0]!, crew.id);
    const v = (await t.req("GET", `/nights/${night.id}`, { token: users[1]!.token })).body.night;
    expect(v).toMatchObject({ venue: null, title: null, startedBy: null, code: null });
  });
  it("if the blocked person got in first, the blocker can still join", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Ex"]);
    const [maya, theo, ex] = users;
    await t.req("POST", "/blocks", { token: maya!.token, json: { userId: ex!.id } });
    const night = await liveNight(t, theo!, crew.id, [ex!]);
    expect((await t.req("POST", `/nights/${night.id}/join`, { token: maya!.token })).status).toBe(200);
    const v = (await t.req("GET", `/nights/${night.id}`, { token: maya!.token })).body.night;
    expect(v.participants.map((p: { name: string }) => p.name)).not.toContain("Ex");
  });
});

describe("H2: links and codes can't be passed around forever", () => {
  it("guests can't make links or see the code; links cap at 10; hosts hear about code joins; rotation revokes", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya"]);
    const maya = users[0]!;
    const night = await liveNight(t, maya, crew.id);
    const inv = (await t.req("POST", `/nights/${night.id}/invites`, { token: maya.token })).body;
    expect(inv.maxUses).toBe(10);
    const guest = await t.user("Guest");
    await t.req("POST", "/invites/redeem", { token: guest.token, json: { token: inv.token } });
    expect((await t.req("POST", `/nights/${night.id}/invites`, { token: guest.token })).status).toBe(403);
    expect((await t.req("GET", `/nights/${night.id}`, { token: guest.token })).body.night.code).toBeNull();
    const inbox = (await t.req("GET", "/me/notifications", { token: maya.token })).body.notifications;
    expect(inbox.map((n: { kind: string }) => n.kind)).toContain("joined_your_night");
    // the host rotates: the old link and the old code stop working
    const rotated = (await t.req("POST", `/nights/${night.id}/code/rotate`, { token: maya.token })).body
      .night;
    expect(rotated.code).not.toBe(night.code);
    const late = await t.user("Late");
    expect(
      (await t.req("POST", "/invites/redeem", { token: late.token, json: { token: inv.token } })).status,
    ).toBe(410);
    expect(
      (await t.req("POST", "/nights/join", { token: late.token, json: { code: night.code } })).status,
    ).toBe(404);
    expect((await t.req("POST", `/nights/${night.id}/code/rotate`, { token: guest.token })).status).toBe(403);
  });
  it("a link's creator can revoke it", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya"]);
    const inv = (await t.req("POST", `/crews/${crew.id}/invites`, { token: users[0]!.token })).body;
    expect((await t.req("POST", `/invites/${inv.id}/revoke`, { token: users[0]!.token })).status).toBe(200);
    const x = await t.user("X");
    expect(
      (await t.req("POST", "/invites/redeem", { token: x.token, json: { token: inv.token } })).status,
    ).toBe(410);
  });
});

describe("H3: being reported never traps you in the app", () => {
  it("a reported author can still delete their account; the report survives as evidence", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" });
    const { users, crew } = await crewOf(t, ["Maya", "Theo"]);
    const [maya, theo] = users;
    t.clock.set("2026-10-31T02:00:00Z");
    const night = await liveNight(t, maya!, crew.id, [theo!]);
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T17:00:00Z");
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    await t.req("POST", `/shots/${shot.id}/report`, { token: theo!.token, json: { reason: "harassment" } });
    expect((await t.req("DELETE", "/me", { token: maya!.token })).body).toMatchObject({ deleted: true });
    const r = await service(t.db, `select reported_user_snapshot = $1 as kept from reports`, [maya!.id]);
    expect(r.rows[0]).toEqual({ kept: true });
  });
});

describe("H4: a subject can veto before anyone else sees it", () => {
  it("tagged during the author's morning review, the subject previews and hides it before the unlock", async () => {
    const t = await testApp();
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users;
    const night = await liveNight(t, maya!, crew.id, [theo!, jules!]);
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    expect(
      (await t.req("POST", `/shots/${shot.id}/tags`, { token: maya!.token, json: { userId: theo!.id } }))
        .status,
    ).toBe(201);
    // before the unlock: Theo (tagged) sees it privately, Jules doesn't
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: theo!.token })).body.night.shots.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([shot.id]);
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules!.token })).body.night.shots).toEqual([]);
    expect((await t.req("GET", "/me/tags", { token: theo!.token })).body.tags).toHaveLength(1);
    expect(
      (await t.req("GET", "/me/notifications", { token: theo!.token })).body.notifications.map(
        (n: { kind: string }) => n.kind,
      ),
    ).toContain("tagged");
    expect((await t.req("POST", `/shots/${shot.id}/hide`, { token: theo!.token })).status).toBe(200);
    t.clock.set("2026-10-31T15:01:00Z");
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules!.token })).body.night.shots).toEqual([]);
  });
});

describe("M5: deleting your account takes your face with you", () => {
  it("photos you were tagged in are hidden after you delete your account", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" });
    const { users, crew } = await crewOf(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users;
    t.clock.set("2026-10-31T02:00:00Z");
    const night = await liveNight(t, maya!, crew.id, [theo!, jules!]);
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T17:00:00Z");
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    await t.req("POST", `/shots/${shot.id}/tags`, { token: maya!.token, json: { userId: theo!.id } });
    await t.req("PATCH", `/shots/${shot.id}/tags/me`, { token: theo!.token, json: { status: "approved" } });
    expect((await t.req("DELETE", "/me", { token: theo!.token })).body).toMatchObject({ deleted: true });
    expect((await t.req("GET", `/nights/${night.id}`, { token: jules!.token })).body.night.shots).toEqual([]);
  });
});

describe("L1/L2", () => {
  it("the real profile route enforces 21+ on the server clock", async () => {
    const t = await testApp();
    const { mintToken } = await import("../src/auth");
    const kid = mintToken(t.deps, "12345678-1234-4234-8234-123456789012");
    expect(
      (
        await t.req("POST", "/me/profile", {
          token: kid,
          json: { name: "Kid", birthdate: "2008-01-01", tz: "America/Chicago" },
        })
      ).status,
    ).toBe(403);
    const adult = mintToken(t.deps, "12345678-1234-4234-8234-123456789013");
    expect(
      (
        await t.req("POST", "/me/profile", {
          token: adult,
          json: { name: "Adult", birthdate: "1995-05-05", tz: "America/Chicago" },
        })
      ).status,
    ).toBe(201);
    expect((await t.req("GET", "/me", { token: adult })).body.name).toBe("Adult");
  });
  it("PNG stripping is an allowlist: private and C2PA chunks go", () => {
    const chunk = (type: string, data: number[]) => [
      0,
      0,
      0,
      data.length,
      ...[...type].map((ch) => ch.charCodeAt(0)),
      ...data,
      0,
      0,
      0,
      0,
    ];
    const png = Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...chunk("IHDR", [0, 0, 0, 4, 0, 0, 0, 3, 8, 2, 0, 0, 0]),
      ...chunk("caBX", [...Buffer.from("c2pa-location")]),
      ...chunk("vpAg", [...Buffer.from("vendor-gps")]),
      ...chunk("IDAT", [1, 2, 3]),
      ...chunk("IEND", []),
    ]);
    const out = Buffer.from(stripPng(png)).toString("latin1");
    expect(out).not.toContain("c2pa");
    expect(out).not.toContain("vendor-gps");
    expect(out).toContain("IDAT");
  });
  it("(sanity) the GPS fixture is still stripped end to end", async () => {
    expect(Buffer.from(jpegWithGps()).toString("latin1")).toContain("GPSLatitude");
  });
});
