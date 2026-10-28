import { describe, expect, it } from "vitest";
import {
  checkAge,
  ageOn,
  parseBirthdate,
  codeAttemptAllowed,
  generateNightCode,
  inviteExpiry,
  inviteLinks,
  inviteStatus,
  inviteTokenFromBytes,
  normalizeCode,
  parseInviteInput,
  toBase64Url,
  CODE_ATTEMPTS,
  deferUntil,
  holdToConfirmMs,
  isNightMode,
  shouldDefer,
  undoWindowMs,
  TARGETS,
  fixedClock,
  offsetClock,
} from "../src";

const at = (iso: string) => new Date(iso);
const CHI = "America/Chicago";

describe("night codes", () => {
  it("generates 4 digits incl. leading zeros, deterministically from the source", () => {
    expect(generateNightCode(() => 0)).toBe("0000");
    expect(generateNightCode(() => 0.999999)).toBe("9999");
    const seq = [0.1, 0.2, 0.3, 0.4];
    let i = 0;
    expect(generateNightCode(() => seq[i++]!)).toBe("1234");
  });
  it("normalizes forgiving input", () => {
    expect(normalizeCode(" 12 34 ")).toBe("1234");
    expect(normalizeCode("1-2-3-4")).toBe("1234");
    expect(normalizeCode("0042")).toBe("0042");
    expect(normalizeCode("123")).toBeNull();
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12a4")).toBeNull();
    expect(normalizeCode(undefined as unknown as string)).toBeNull();
  });
  it("limits guesses to 10 per 10 minutes", () => {
    const now = at("2026-10-31T03:00:00Z");
    const recent = Array.from({ length: CODE_ATTEMPTS.max }, (_, k) => new Date(now.getTime() - k * 1000));
    expect(codeAttemptAllowed(recent.slice(0, 9), now)).toBe(true);
    expect(codeAttemptAllowed(recent, now)).toBe(false);
    const old = recent.map((t) => new Date(t.getTime() - CODE_ATTEMPTS.windowMs));
    expect(codeAttemptAllowed(old, now)).toBe(true);
  });
});

describe("invite tokens", () => {
  it("base64url-encodes like Node's Buffer", () => {
    for (const len of [1, 2, 3, 16, 17, 31, 32]) {
      const bytes = Uint8Array.from({ length: len }, (_, k) => (k * 37 + 11) % 256);
      expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });
  it("needs 128 bits", () => {
    expect(() => inviteTokenFromBytes(new Uint8Array(8))).toThrow();
    expect(inviteTokenFromBytes(new Uint8Array(16))).toHaveLength(22);
  });
  it("parses scanned QRs, links and raw tokens", () => {
    const tok = inviteTokenFromBytes(Uint8Array.from({ length: 16 }, (_, k) => k));
    const links = inviteLinks(tok);
    expect(parseInviteInput(links.app)).toBe(tok);
    expect(parseInviteInput(links.web)).toBe(tok);
    expect(parseInviteInput(`  ${tok} `)).toBe(tok);
    expect(parseInviteInput("https://evil.example/j/abc")).toBeNull();
    expect(parseInviteInput("short")).toBeNull();
  });
  it("expires, revokes, and uses up", () => {
    const now = at("2026-10-31T03:00:00Z");
    const inv = {
      kind: "crew" as const,
      expiresAt: inviteExpiry("crew", now),
      revokedAt: null,
      maxUses: 2,
      uses: 0,
    };
    expect(inviteStatus(inv, now)).toMatchObject({ ok: true });
    expect(inviteStatus(inv, new Date(now.getTime() + 8 * 86_400_000))).toMatchObject({ error: "expired" });
    expect(inviteStatus({ ...inv, revokedAt: now }, now)).toMatchObject({ error: "revoked" });
    expect(inviteStatus({ ...inv, uses: 2 }, now)).toMatchObject({ error: "used_up" });
    expect(inviteStatus({ ...inv, maxUses: null, uses: 999 }, now)).toMatchObject({ ok: true });
    expect(inviteExpiry("night", now, at("2026-10-31T10:00:00Z")).toISOString()).toBe(
      "2026-10-31T10:00:00.000Z",
    );
    expect(() => inviteExpiry("night", now)).toThrow();
  });
});

describe("21+ gate", () => {
  const now = at("2026-10-31T15:00:00Z"); // Oct 31 in Chicago
  it("parses only real dates", () => {
    expect(parseBirthdate("2005-02-29")).toBeNull();
    expect(parseBirthdate("2004-02-29")).toEqual({ year: 2004, month: 2, day: 29 });
    expect(parseBirthdate("31/10/2000")).toBeNull();
  });
  it("turns 21 on the birthday, in local time", () => {
    expect(checkAge("2005-10-31", now, CHI)).toEqual({ ok: true, value: 21 });
    expect(checkAge("2005-11-01", now, CHI)).toMatchObject({ error: "under_21" });
    // 03:00Z on Nov 1 is still Oct 31 in Chicago
    expect(ageOn({ year: 2005, month: 11, day: 1 }, at("2026-11-01T03:00:00Z"), CHI)).toBe(20);
    expect(ageOn({ year: 2005, month: 11, day: 1 }, at("2026-11-01T03:00:00Z"), "Europe/London")).toBe(21);
  });
  it("rejects nonsense", () => {
    expect(checkAge("2030-01-01", now, CHI)).toMatchObject({ error: "implausible" });
    expect(checkAge("1850-01-01", now, CHI)).toMatchObject({ error: "implausible" });
    expect(checkAge("nope", now, CHI)).toMatchObject({ error: "invalid_date" });
  });
});

describe("drunk-proof rules", () => {
  it("night mode: in a live night or 21:00–05:59 local, with overrides", () => {
    expect(isNightMode({ now: at("2026-10-31T17:00:00Z"), tz: CHI, inLiveNight: false })).toBe(false); // noon
    expect(isNightMode({ now: at("2026-10-31T17:00:00Z"), tz: CHI, inLiveNight: true })).toBe(true);
    expect(isNightMode({ now: at("2026-11-01T02:00:00Z"), tz: CHI, inLiveNight: false })).toBe(true); // 21:00
    expect(isNightMode({ now: at("2026-10-31T10:59:00Z"), tz: CHI, inLiveNight: false })).toBe(true); // 05:59
    expect(isNightMode({ now: at("2026-10-31T11:00:00Z"), tz: CHI, inLiveNight: false })).toBe(false); // 06:00
    expect(isNightMode({ now: at("2026-11-01T02:00:00Z"), tz: CHI, inLiveNight: true, pref: "never" })).toBe(
      false,
    );
    expect(
      isNightMode({ now: at("2026-10-31T17:00:00Z"), tz: CHI, inLiveNight: false, pref: "always" }),
    ).toBe(true);
  });
  it("longer undo and hold at night; bigger targets", () => {
    expect(undoWindowMs(true)).toBe(8000);
    expect(undoWindowMs(false)).toBe(5000);
    expect(holdToConfirmMs(true)).toBeGreaterThan(holdToConfirmMs(false));
    expect(TARGETS.nightPrimary).toBeGreaterThanOrEqual(88);
    expect(TARGETS.nightMin).toBeGreaterThanOrEqual(56);
    expect(TARGETS.dayMin).toBeGreaterThanOrEqual(44);
  });
  it("defers irreversible social actions at night, never safety actions", () => {
    for (const a of ["leave_crew", "delete_account", "delete_crew"] as const) {
      expect(shouldDefer(a, true)).toBe(true);
      expect(shouldDefer(a, false)).toBe(false);
    }
    for (const a of ["block_user", "report", "hide_shot", "delete_shot", "remove_member"] as const)
      expect(shouldDefer(a, true)).toBe(false);
  });
  it("defers until the next 10am", () => {
    expect(deferUntil(at("2026-10-31T07:00:00Z"), CHI).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(deferUntil(at("2026-10-31T15:00:00Z"), CHI).toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });
});

describe("clocks", () => {
  it("fixed clocks advance; offset clocks shift", () => {
    const c = fixedClock("2026-10-31T00:00:00Z");
    c.advance(60_000);
    expect(c.now().toISOString()).toBe("2026-10-31T00:01:00.000Z");
    const o = offsetClock(c, 3_600_000);
    expect(o.now().toISOString()).toBe("2026-10-31T01:01:00.000Z");
    o.setOffset(0);
    expect(o.offsetMs).toBe(0);
    c.set("2027-01-01T00:00:00Z");
    expect(o.now().getUTCFullYear()).toBe(2027);
  });
});
