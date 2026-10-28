// The ADR 0004 predicate in SQL must agree with core's canSeeShot on every shared fixture case.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VISIBILITY_CASES } from "../../core/test/fixtures/visibility";
import { asUser, createPglite, makeCrew, makeNight, makeShot, makeUser, service, type Db } from "../src";

let db: Db;
beforeAll(async () => {
  db = (await createPglite()).db;
});
afterAll(async () => db.close());

describe("RLS visibility matches core (shared fixture)", () => {
  VISIBILITY_CASES.forEach((c, k) => {
    it(c.name, async () => {
      const ids: Record<string, string> = {};
      for (const n of ["maya", "theo", "jules", "sam"]) ids[n] = await makeUser(db, `${n}${k}`);
      const crew = await makeCrew(db, ids.maya!, Object.values(ids));
      const night = await makeNight(db, {
        crewId: crew,
        startedBy: ids.maya!,
        participants: c.participants.map((p) => ids[p]!),
        phase: c.phase,
      });
      const shot = await makeShot(db, night, ids[c.author]!, { status: c.status });
      if (c.subjectHidden) await service(db, `update shots set subject_hidden = true where id = $1`, [shot]);
      for (const r of c.reportedBy ?? [])
        await service(
          db,
          `insert into reports (reporter_id, shot_id, reported_user_id, reason) values ($1, $2, $3, 'harassment')`,
          [ids[r], shot, ids[c.author]],
        );
      for (const h of c.hiddenBy ?? [])
        await service(db, `insert into shot_hides (shot_id, user_id) values ($1, $2)`, [shot, ids[h]]);
      for (const [a, b] of c.blocks ?? [])
        await service(db, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [ids[a], ids[b]]);

      const seen = await asUser(
        db,
        ids[c.viewer]!,
        async (tx) => (await tx.query(`select id from shots where id = $1`, [shot])).rows.length,
      );
      expect(seen === 1).toBe(c.expected);
    });
  });
});
