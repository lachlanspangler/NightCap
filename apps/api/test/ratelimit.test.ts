import { describe, expect, it } from "vitest";
import { testApp } from "./helpers";

describe("rate limits", () => {
  it("time travel backwards never locks everyone out", async () => {
    const t = await testApp();
    const u = await t.user("Maya");
    await t.req("POST", "/dev/clock", { json: { offsetMs: 6 * 3_600_000 } });
    expect((await t.req("GET", "/me", { token: u.token })).status).toBe(200);
    await t.req("POST", "/dev/clock", { json: { jump: "reset" } });
    for (let i = 0; i < 20; i++) expect((await t.req("GET", "/me", { token: u.token })).status).toBe(200);
  });
  it("writes are limited per account", async () => {
    const t = await testApp();
    const u = await t.user("Spammer");
    const codes = [];
    for (let i = 0; i < 70; i++)
      codes.push((await t.req("POST", "/blocks", { token: u.token, json: { userId: u.id } })).status);
    expect(codes).toContain(429);
  });
});
