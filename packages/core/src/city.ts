// City Nights: opt-in, safety-first ways to meet people (MEET_PEOPLE.md).
import { HOUR } from "./time";
import { err, ok, type Result } from "./result";

export type Gender = "woman" | "man" | "nonbinary" | "unspecified";

export interface SignupBlock {
  /** A solo signup is a block of 1; a crew signing up together is one block (kept together). */
  blockId: string;
  members: { userId: string; gender: Gender }[];
}

export interface TableOptions {
  min: number;
  max: number;
}

export interface FormedTables {
  tables: { blockIds: string[]; userIds: string[] }[];
  waitlist: string[]; // blockIds
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function pairSet(pairs: readonly [string, string][]): Set<string> {
  return new Set(pairs.map(([a, b]) => pairKey(a, b)));
}

/**
 * Deterministic greedy seating. Hard constraints: table sizes within [min, max], blocks kept whole,
 * blocked pairs (either direction) never at the same table. Soft: spread people who've met before,
 * keep gender mixes balanced (and avoid being the only woman/nonbinary person at a table).
 */
export function formTables(
  blocks: readonly SignupBlock[],
  opts: TableOptions,
  blocked: Set<string>,
  metBefore: Set<string> = new Set(),
): FormedTables {
  // A block that contains a blocked pair is split into solos (code review M1 #2): nobody sits next
  // to someone they've blocked, even if a group signup tried to bundle them.
  const safe = blocks.flatMap((b) =>
    b.members.some((p, i) => b.members.some((q, j) => j > i && blocked.has(pairKey(p.userId, q.userId))))
      ? b.members.map((m) => ({ blockId: `${b.blockId}:${m.userId}`, members: [m] }))
      : [b],
  );
  const valid = safe.filter((b) => b.members.length > 0 && b.members.length <= opts.max);
  const tooBig = safe.filter((b) => b.members.length > opts.max).map((b) => b.blockId);
  const total = valid.reduce((n, b) => n + b.members.length, 0);
  if (total < opts.min) return { tables: [], waitlist: [...valid.map((b) => b.blockId), ...tooBig] };

  const ideal = (opts.min + opts.max) / 2;
  const lo = Math.ceil(total / opts.max);
  const hi = Math.max(lo, Math.floor(total / opts.min));
  const n0 = Math.min(hi, Math.max(lo, Math.round(total / ideal)));
  // Blocks can make the "ideal" table count waitlist people who'd fit with one more table; try
  // more tables (up to what the minimum allows) and keep the arrangement that seats the most.
  let best: FormedTables | null = null;
  for (let n = n0; n <= hi; n++) {
    const r = seat(valid, n, opts, blocked, metBefore, tooBig);
    const seated = (x: FormedTables) => x.tables.reduce((k, t) => k + t.userIds.length, 0);
    if (!best || seated(r) > seated(best)) best = r;
    if (r.waitlist.length === tooBig.length) break;
  }
  return best!;
}

function seat(
  valid: readonly SignupBlock[],
  n: number,
  opts: TableOptions,
  blocked: Set<string>,
  metBefore: Set<string>,
  tooBig: string[],
): FormedTables {
  const order = [...valid].sort(
    (a, b) => b.members.length - a.members.length || a.blockId.localeCompare(b.blockId),
  );
  const tables: SignupBlock[][] = Array.from({ length: n }, () => []);
  const waitlist: string[] = [...tooBig];

  const people = (t: SignupBlock[]) => t.flatMap((b) => b.members);
  const conflicts = (t: SignupBlock[], b: SignupBlock) =>
    people(t).some((p) => b.members.some((q) => blocked.has(pairKey(p.userId, q.userId))));
  const genderCost = (members: { gender: Gender }[]) => {
    const c = { woman: 0, man: 0, nonbinary: 0, unspecified: 0 };
    for (const m of members) c[m.gender]++;
    let cost = Math.abs(c.woman - c.man) * 0.5;
    if (members.length >= 3) {
      if (c.woman === 1) cost += 2;
      if (c.nonbinary === 1 && c.woman === 0) cost += 1;
    }
    return cost;
  };
  const cost = (t: SignupBlock[], b: SignupBlock) => {
    const seated = people(t);
    const met = seated.reduce(
      (k, p) => k + b.members.filter((q) => metBefore.has(pairKey(p.userId, q.userId))).length,
      0,
    );
    return seated.length * 1 + met * 5 + genderCost([...seated, ...b.members]);
  };

  for (const b of order) {
    let best = -1;
    let bestCost = Infinity;
    tables.forEach((t, i) => {
      if (people(t).length + b.members.length > opts.max || conflicts(t, b)) return;
      const c = cost(t, b);
      if (c < bestCost) {
        bestCost = c;
        best = i;
      }
    });
    if (best === -1) waitlist.push(b.blockId);
    else tables[best]!.push(b);
  }

  // Tables under min: first borrow compatible blocks from tables that can spare them (choosing the
  // move that keeps both tables' gender mix best)…
  for (const t of tables) {
    while (t.length > 0 && people(t).length < opts.min) {
      let pick: { donor: SignupBlock[]; idx: number; score: number } | null = null;
      for (const donor of tables) {
        if (donor === t) continue;
        donor.forEach((b, idx) => {
          if (people(donor).length - b.members.length < opts.min) return;
          if (people(t).length + b.members.length > opts.max || conflicts(t, b)) return;
          const rest = donor.filter((_, k) => k !== idx);
          const score = genderCost([...people(t), ...b.members]) + genderCost(people(rest));
          if (!pick || score < pick.score) pick = { donor, idx, score };
        });
      }
      if (!pick) break;
      const chosen: { donor: SignupBlock[]; idx: number } = pick;
      t.push(chosen.donor.splice(chosen.idx, 1)[0]!);
    }
  }
  // Hard rule (privacy review M3): a woman who came alone is never the only woman at a table of
  // 3+. Move her to a table with women, or swap her with a solo man there; otherwise waitlist her
  // (if her table can spare her). A woman who came with friends isn't alone, so this doesn't apply.
  const women = (t: SignupBlock[]) => people(t).filter((p) => p.gender === "woman").length;
  const loneSolo = (t: SignupBlock[]) =>
    people(t).length >= 3 && women(t) === 1
      ? t.find((b) => b.members.length === 1 && b.members[0]!.gender === "woman")
      : undefined;
  const fixLone = () => {
    for (const t of tables) {
      const w = loneSolo(t);
      if (!w) continue;
      const others = tables.filter((u) => u !== t);
      // a) move her to a table that has women and room
      const dest = others.find(
        (u) =>
          women(u) >= 1 &&
          people(u).length < opts.max &&
          people(t).length - 1 >= opts.min &&
          !conflicts(u, w),
      );
      if (dest) {
        t.splice(t.indexOf(w), 1);
        dest.push(w);
        continue;
      }
      // b) swap her with a solo man from a table that has women
      let swapped = false;
      for (const u of others) {
        if (women(u) < 1) continue;
        const man = u.find(
          (b) =>
            b.members.length === 1 &&
            b.members[0]!.gender === "man" &&
            !conflicts(
              t.filter((x) => x !== w),
              b,
            ),
        );
        if (
          !man ||
          conflicts(
            u.filter((x) => x !== man),
            w,
          )
        )
          continue;
        t.splice(t.indexOf(w), 1, man);
        u.splice(u.indexOf(man), 1, w);
        swapped = true;
        break;
      }
      if (swapped) continue;
      // c) waitlist her rather than seat her alone
      // (if that leaves the table short, the small-table pass below re-homes or waitlists the rest)
      t.splice(t.indexOf(w), 1);
      waitlist.push(w.blockId);
    }
  };

  // …then move what's left of any still-small table elsewhere, or waitlist it.
  const dissolveSmall = () => {
    for (let i = tables.length - 1; i >= 0; i--) {
      const t = tables[i]!;
      if (people(t).length >= opts.min || t.length === 0) continue;
      tables.splice(i, 1);
      for (const b of t) {
        const target = tables.find(
          (o) =>
            people(o).length >= opts.min &&
            people(o).length + b.members.length <= opts.max &&
            !conflicts(o, b),
        );
        // Never re-home a solo woman into a table where she'd be the only woman.
        const ok =
          target &&
          !(
            b.members.length === 1 &&
            b.members[0]!.gender === "woman" &&
            women(target) === 0 &&
            people(target).length >= 2
          );
        if (target && ok) target.push(b);
        else waitlist.push(b.blockId);
      }
    }
  };

  for (let pass = 0; pass < 6; pass++) {
    const before = JSON.stringify(tables.map((t) => t.map((x) => x.blockId)));
    dissolveSmall();
    fixLone();
    if (JSON.stringify(tables.map((t) => t.map((x) => x.blockId))) === before) break;
  }
  dissolveSmall();

  return {
    tables: tables
      .filter((t) => t.length > 0)
      .map((t) => ({ blockIds: t.map((b) => b.blockId), userIds: people(t).map((p) => p.userId) })),
    waitlist: waitlist.sort(),
  };
}

export interface KeepInTouch {
  eventId: string;
  fromUserId: string;
  toUserId: string;
  yes: boolean;
}

/** Contact opens only on a mutual yes. A "no" is invisible to the other person. */
export function mutualMatches(optins: readonly KeepInTouch[]): [string, string][] {
  const yes = new Set(optins.filter((o) => o.yes).map((o) => `${o.eventId}|${o.fromUserId}|${o.toUserId}`));
  const out = new Map<string, [string, string]>();
  for (const o of optins) {
    if (!o.yes) continue;
    if (yes.has(`${o.eventId}|${o.toUserId}|${o.fromUserId}`)) {
      const [a, b] = o.fromUserId < o.toUserId ? [o.fromUserId, o.toUserId] : [o.toUserId, o.fromUserId];
      out.set(`${a}|${b}`, [a, b]);
    }
  }
  return [...out.values()].sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
}

export type CityGateError = "not_21" | "not_verified" | "no_code_of_conduct" | "not_opted_in";

export function canJoinCityNights(p: {
  is21: boolean;
  ageVerified: boolean;
  cocAcceptedAt: Date | null;
  cityOptIn: boolean;
}): Result<undefined, CityGateError> {
  if (!p.is21) return err("not_21");
  if (!p.cityOptIn) return err("not_opted_in");
  if (!p.cocAcceptedAt) return err("no_code_of_conduct");
  if (!p.ageVerified) return err("not_verified");
  return ok();
}

export const CITY_RULES = {
  revealBeforeMs: 2 * HOUR,
  defaultTable: { min: 4, max: 6 } as TableOptions,
  maxBlockSize: 3,
} as const;

/** Tablemates' first names + fun lines show 2 hours before. */
export function tableRevealed(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime() - CITY_RULES.revealBeforeMs;
}

export const CODE_OF_CONDUCT = [
  "Everyone here chose to meet new people. Be kind, be curious.",
  "No means no, the first time. Respect people's space and limits.",
  "Photos from tonight stay with tonight's table. Ask before you snap someone.",
  "Look out for each other. Anyone can leave, report or block at any time.",
] as const;

export const CITIES = [
  { id: "minneapolis", name: "Minneapolis", tz: "America/Chicago" },
  { id: "chicago", name: "Chicago", tz: "America/Chicago" },
  { id: "nyc", name: "New York", tz: "America/New_York" },
] as const;
export type CityId = (typeof CITIES)[number]["id"];
