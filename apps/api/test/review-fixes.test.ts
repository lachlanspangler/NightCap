// Regression tests for code review M1 findings.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { photoForm, testApp, type TestApp } from "./helpers";

async function crew(t: TestApp, names: string[]) {
  const users = [];
  for (const n of names) users.push(await t.user(n));
  const c = (await t.req("POST", "/crews", { token: users[0]!.token, json: { name: "Owls" } })).body.crew;
  for (const u of users.slice(1)) {
    const inv = (await t.req("POST", `/crews/${c.id}/invites`, { token: users[0]!.token })).body;
    await t.req("POST", "/invites/redeem", { token: u.token, json: { token: inv.token } });
  }
  return { users, crew: c };
}

describe("code review M1 regressions", () => {
  it("#5 prod with a missing key refuses to start instead of falling back to mock", () => {
    expect(() => loadConfig({ NIGHTCAP_MODE: "prod", DATABASE_URL: "postgres://x" }, () => "s")).toThrow(
      /missing/,
    );
    expect(loadConfig({}, () => "s").mode).toBe("mock");
  });

  it("#7 after the unlock, tossed shots are gone for the author too (their media was deleted)", async () => {
    const t = await testApp();
    const { users, crew: c } = await crew(t, ["Maya"]);
    const night = (await t.req("POST", `/crews/${c.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    const a = (
      await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: photoForm() })
    ).body.shot;
    await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: photoForm() });
    await t.req("PATCH", `/shots/${a.id}`, { token: users[0]!.token, json: { status: "discarded" } });
    t.clock.set("2026-10-31T15:01:00Z");
    const v = (await t.req("GET", `/nights/${night.id}`, { token: users[0]!.token })).body.night;
    expect(v.shots.map((s: { id: string }) => s.id)).not.toContain(a.id);
    for (const s of v.shots) expect((await t.req("GET", s.url)).status).toBe(200);
  });

  it("#9 a report hides the shot from the reporter, whatever the reason", async () => {
    const t = await testApp();
    const { users, crew: c } = await crew(t, ["Maya", "Theo", "Jules"]);
    const [maya, theo, jules] = users;
    const night = (await t.req("POST", `/crews/${c.id}/nights`, { token: maya!.token, json: {} })).body.night;
    for (const u of [theo, jules]) await t.req("POST", `/nights/${night.id}/join`, { token: u!.token });
    const shot = (await t.req("POST", `/nights/${night.id}/shots`, { token: maya!.token, form: photoForm() }))
      .body.shot;
    t.clock.set("2026-10-31T15:01:00Z");
    await t.req("GET", `/nights/${night.id}`, { token: maya!.token });
    await t.req("POST", `/shots/${shot.id}/report`, { token: theo!.token, json: { reason: "harassment" } });
    expect((await t.req("GET", `/nights/${night.id}`, { token: theo!.token })).body.night.shots).toEqual([]);
    expect(
      (await t.req("GET", `/nights/${night.id}`, { token: jules!.token })).body.night.shots,
    ).toHaveLength(1);
  });

  it("#10 an owner leaving hands the crew on", async () => {
    const t = await testApp({ now: "2026-10-31T17:00:00Z" });
    const { users, crew: c } = await crew(t, ["Maya", "Theo"]);
    expect(
      (await t.req("DELETE", `/crews/${c.id}/members/${users[0]!.id}`, { token: users[0]!.token })).status,
    ).toBe(200);
    expect((await t.req("GET", `/crews/${c.id}`, { token: users[1]!.token })).body.crew.myRole).toBe("owner");
  });

  it("#11 blocking an unknown user is a 404, not a 500", async () => {
    const t = await testApp();
    const u = await t.user("Maya");
    expect(
      (
        await t.req("POST", "/blocks", {
          token: u.token,
          json: { userId: "99999999-9999-4999-8999-999999999999" },
        })
      ).status,
    ).toBe(404);
  });

  it("#13 oversized uploads are refused", async () => {
    const t = await testApp();
    const { users, crew: c } = await crew(t, ["Maya"]);
    const night = (await t.req("POST", `/crews/${c.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    const big = new Uint8Array(13 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    expect(
      (await t.req("POST", `/nights/${night.id}/shots`, { token: users[0]!.token, form: photoForm(big) }))
        .status,
    ).toBe(413);
  });

  it("#14 an unknown time zone is a 422, not a 500", async () => {
    const t = await testApp();
    expect(
      (await t.req("POST", "/dev/signup", { json: { name: "A", birthdate: "1990-01-01", tz: "Mars/Base" } }))
        .status,
    ).toBe(422);
    expect((await t.req("POST", "/dev/clock", { json: { jump: "morning", tz: "Nope/Nope" } })).status).toBe(
      422,
    );
  });
});

describe("code review M1 round 2", () => {
  it("R2-2 re-entering your own night's code takes you back to it", async () => {
    const t = await testApp();
    const { users, crew: c } = await crew(t, ["Maya"]);
    const night = (await t.req("POST", `/crews/${c.id}/nights`, { token: users[0]!.token, json: {} })).body
      .night;
    const r = await t.req("POST", "/nights/join", { token: users[0]!.token, json: { code: night.code } });
    expect(r.status).toBe(200);
    expect(r.body.night.id).toBe(night.id);
  });
  it("R2-1 the IP key ignores client-written X-Forwarded-For hops", async () => {
    const { clientKey } = await import("../src/app");
    const fake = (xff: string) => ({ req: { header: () => xff } }) as never;
    process.env.TRUST_PROXY = "1";
    expect(clientKey(fake("6.6.6.6, 10.0.0.9"))).toBe("10.0.0.9");
    delete process.env.TRUST_PROXY;
    expect(clientKey(fake("6.6.6.6"))).toBe("in-process");
  });
});
