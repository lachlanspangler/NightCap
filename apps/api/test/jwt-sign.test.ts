import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "../src/jwt";
import { signMediaPath, verifyMediaSig } from "../src/media/sign";

const sub = "11111111-1111-4111-8111-111111111111";

describe("jwt", () => {
  it("round-trips and expires", () => {
    const t = signJwt({ sub, role: "authenticated" }, "s", 1000, 60);
    expect(verifyJwt(t, "s", 1030)?.sub).toBe(sub);
    expect(verifyJwt(t, "s", 1061)).toBeNull();
  });
  it("rejects wrong secrets, tampering, alg none and junk", () => {
    const t = signJwt({ sub, role: "authenticated" }, "s", 1000);
    expect(verifyJwt(t, "other", 1000)).toBeNull();
    const [h, b] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "22222222-2222-4222-8222-222222222222", role: "authenticated", exp: 9e9 }),
    ).toString("base64url");
    expect(verifyJwt(`${h}.${forged}.${t.split(".")[2]}`, "s", 1000)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(verifyJwt(`${none}.${b}.`, "s", 1000)).toBeNull();
    expect(verifyJwt("nope", "s", 1000)).toBeNull();
    expect(verifyJwt(signJwt({ sub: "not-a-uuid", role: "authenticated" }, "s", 1000), "s", 1000)).toBeNull();
  });
});

describe("signed media URLs", () => {
  const shot = "33333333-3333-4333-8333-333333333333";
  it("bind shot + viewer + expiry", () => {
    const path = signMediaPath("k", shot, sub, 1000);
    const u = new URL(`http://x${path}`);
    const exp = Number(u.searchParams.get("exp"));
    const sig = u.searchParams.get("sig")!;
    expect(exp).toBeGreaterThanOrEqual(1600);
    expect(verifyMediaSig("k", shot, sub, exp, sig, 1000)).toBe(true);
    expect(verifyMediaSig("k", shot, "22222222-2222-4222-8222-222222222222", exp, sig, 1000)).toBe(false);
    expect(verifyMediaSig("k", shot, sub, exp + 60, sig, 1000)).toBe(false);
    expect(verifyMediaSig("k", shot, sub, exp, sig, exp)).toBe(false);
    expect(verifyMediaSig("other", shot, sub, exp, sig, 1000)).toBe(false);
  });
});
