// One tick of background work: advance nights, open weekly moments, deliver nudges.
import { asService } from "@nightcap/db";
import type { Deps } from "../deps";
import { ensureMoment, runNudges } from "./moments";
import { advanceDue } from "./nights";

export async function tick(deps: Deps) {
  const crews = await asService(
    deps.db,
    async (tx) => (await tx.query<{ id: string }>(`select id from crews where kind = 'long_distance'`)).rows,
  );
  for (const c of crews) {
    await ensureMoment(deps, c.id);
    await runNudges(deps, c.id);
  }
  return advanceDue(deps);
}
