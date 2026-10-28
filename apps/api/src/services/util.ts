import { createHash } from "node:crypto";
import { isNightMode, type NightModePref } from "@nightcap/core";
import { asService } from "@nightcap/db";
import type { Deps } from "../deps";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface MeRow {
  id: string;
  display_name: string;
  avatar_hue: number;
  city: string | null;
  city_opt_in: boolean;
  gender: string;
  fun_line: string | null;
  night_mode_pref: NightModePref;
  tz: string;
  age_verified_at: Date | null;
  coc_accepted_at: Date | null;
  is_21_attested: boolean;
  is_demo: boolean;
}

/** Your own private profile fields (never birthdate). Service read scoped to the caller's own id. */
export async function loadMe(deps: Deps, userId: string): Promise<MeRow | null> {
  return asService(deps.db, async (tx) => {
    const r = await tx.query<MeRow>(
      `select id, display_name, avatar_hue, city, city_opt_in, gender, fun_line, night_mode_pref, tz, age_verified_at, coc_accepted_at, is_21_attested, is_demo
       from profiles where id = $1`,
      [userId],
    );
    return r.rows[0] ?? null;
  });
}

export async function liveNightOf(
  deps: Deps,
  userId: string,
): Promise<{ id: string; crew_id: string | null; title: string | null } | null> {
  return asService(deps.db, async (tx) => {
    const r = await tx.query<{ id: string; crew_id: string | null; title: string | null }>(
      `select n.id, n.crew_id, n.title from night_members m join nights n on n.id = m.night_id
       where m.user_id = $1 and n.ended_at is null and n.kind <> 'moment' order by n.started_at desc limit 1`,
      [userId],
    );
    return r.rows[0] ?? null;
  });
}

export async function nightModeFor(deps: Deps, me: MeRow): Promise<boolean> {
  const live = await liveNightOf(deps, me.id);
  return isNightMode({ now: deps.clock.now(), tz: me.tz, inLiveNight: !!live, pref: me.night_mode_pref });
}
