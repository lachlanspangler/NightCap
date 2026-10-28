// Executes actions that night mode deferred to the morning (DRUNK_UX "Ask me in the morning").
import { asService, asUser } from "@nightcap/db";
import type { Deps } from "../deps";

export async function executeDeferred(
  deps: Deps,
  userId: string,
  action: string,
  payload: Record<string, string>,
) {
  if (action === "leave_crew" || action === "remove_member") {
    const target = action === "leave_crew" ? userId : payload.userId;
    await asUser(deps.db, userId, (tx) =>
      tx.query(`delete from crew_members where crew_id = $1 and user_id = $2`, [payload.crewId, target]),
    );
    // Removed (or leaving) also means out of the crew's nights that haven't developed yet (C1):
    // a removed person must not see tonight's album in the morning.
    await asService(deps.db, (tx) =>
      tx.query(
        `delete from night_members where user_id = $2 and night_id in (select id from nights where crew_id = $1 and unlocked_at is null)`,
        [payload.crewId, target],
      ),
    );
    // A crew is never left without an owner (code review #10): hand it to the longest-standing member.
    await asService(deps.db, (tx) =>
      tx.query(
        `update crew_members set role = 'owner' where crew_id = $1 and user_id = (
           select user_id from crew_members where crew_id = $1 order by joined_at, user_id limit 1)
         and not exists (select 1 from crew_members where crew_id = $1 and role = 'owner')`,
        [payload.crewId],
      ),
    );
    return;
  }
  if (action === "delete_account") {
    // Hard delete: media first, then the auth user (cascades profile → crews created, memberships, shots, tags…).
    const keys = await asService(deps.db, async (tx) =>
      // Evidence (reported nudity / under-18) is preserved for review (privacy review C2).
      (
        await tx.query<{ media_key: string }>(
          `select media_key from shots where author_id = $1 and not evidence_hold`,
          [userId],
        )
      ).rows.map((r) => r.media_key),
    );
    for (const k of keys) await deps.media.delete(k).catch(() => undefined);
    await asService(deps.db, async (tx) => {
      // Crews they own pass to the longest-standing other member, so friends don't lose their crew.
      await tx.query(
        `update crew_members cm set role = 'owner' from (
           select distinct on (m.crew_id) m.crew_id, m.user_id from crew_members m
           join crew_members mine on mine.crew_id = m.crew_id and mine.user_id = $1 and mine.role = 'owner'
           where m.user_id <> $1 order by m.crew_id, m.joined_at) heir
         where cm.crew_id = heir.crew_id and cm.user_id = heir.user_id`,
        [userId],
      );
      await tx.query(
        `update crews c set created_by = (select user_id from crew_members where crew_id = c.id and role = 'owner' and user_id <> $1 limit 1)
                      where created_by = $1 and exists (select 1 from crew_members where crew_id = c.id and user_id <> $1)`,
        [userId],
      );
      // Photos you were tagged in (kept or pending) get hidden for good, so leaving NightCap takes
      // your face with you, not just the photos you took (privacy review M5).
      await tx.query(
        `update shots set subject_hidden = true where id in (select shot_id from shot_tags where subject_id = $1 and status <> 'removed')`,
        [userId],
      );
      // Hides outlive the hider (migration 0005): make them permanent before the cascade.
      await tx.query(
        `update shots set subject_hidden = true where id in (select shot_id from shot_hides where user_id = $1)`,
        [userId],
      );
      await tx.query(`delete from auth.users where id = $1`, [userId]);
    });
    return;
  }
  if (action === "delete_crew") {
    await asService(deps.db, (tx) =>
      tx.query(
        `delete from crews where id = $1 and exists (select 1 from crew_members where crew_id = $1 and user_id = $2 and role = 'owner')`,
        [payload.crewId, userId],
      ),
    );
  }
}
