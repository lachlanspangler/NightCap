-- 0011 — Privacy & safety review M1 fixes (docs/reviews/m1-privacy.md).

-- ---------------------------------------------------------------------------------------------
-- C2 + H3: reports are evidence. They survive account deletion (snapshots, no FK-dependent check),
-- "minor" splits into under_18 (possible CSAM: preserve, escalate) and under_21, and the reported
-- media is held (author deletion soft-deletes only).
-- ---------------------------------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_check;
alter table public.reports drop constraint if exists reports_reason_check;
update public.reports set reason = 'under_18' where reason = 'minor';
alter table public.reports add constraint reports_reason_check
  check (reason in ('in_photo', 'nudity', 'under_18', 'under_21', 'harassment', 'violence', 'other'));
alter table public.reports add column if not exists reported_user_snapshot uuid;
alter table public.reports add column if not exists media_key_snapshot text;
alter table public.reports add column if not exists content_hash text;
alter table public.reports add column if not exists event_id uuid references public.city_events (id) on delete set null;
alter table public.reports add column if not exists night_id uuid references public.nights (id) on delete set null;
alter table public.reports add column if not exists reviewed_at timestamptz;

alter table public.shots add column if not exists content_hash text;
alter table public.shots add column if not exists evidence_hold boolean not null default false;

-- Exact-hash denylist of media reported as nudity / under-18 (perceptual hashing: prod TODO).
create table if not exists public.blocked_hashes (
  content_hash text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.blocked_hashes enable row level security;
grant all on public.blocked_hashes to service_role;

create or replace function public.report_shot(p_shot uuid, p_reason text, p_note text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  s shots%rowtype;
begin
  p_now := public.nc_now(p_now);
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  select * into s from shots where id = p_shot;
  if not found or not public.is_participant(s.night_id) then perform nc_raise('not_found'); end if;
  insert into reports (reporter_id, shot_id, reported_user_id, reported_user_snapshot, media_key_snapshot, content_hash, night_id, reason, note, created_at)
  values (auth.uid(), p_shot, s.author_id, s.author_id, s.media_key, s.content_hash, s.night_id, p_reason, nullif(btrim(p_note), ''), p_now)
  returning id into rid;
  if p_reason in ('in_photo', 'nudity', 'under_18', 'under_21') then
    insert into shot_hides (shot_id, user_id, reason, created_at) values (p_shot, auth.uid(), 'report', p_now)
    on conflict (shot_id, user_id) do update set reason = 'report';
  end if;
  if p_reason in ('nudity', 'under_18') then
    update shots set evidence_hold = true where id = p_shot;
    if s.content_hash is not null then
      insert into blocked_hashes (content_hash, reason) values (s.content_hash, p_reason) on conflict do nothing;
    end if;
  end if;
  return rid;
end $$;
revoke execute on function public.report_shot(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.report_shot(uuid, text, text, timestamptz) to authenticated;

-- User reports (City Nights tablemates, crew/night members), not tied to a photo (M3).
create or replace function public.report_user(p_user uuid, p_reason text, p_note text, p_event uuid, p_night uuid, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  p_now := public.nc_now(p_now);
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if p_user = auth.uid() or not public.shares_space(p_user) then perform nc_raise('not_found'); end if;
  insert into reports (reporter_id, reported_user_id, reported_user_snapshot, event_id, night_id, reason, note, created_at)
  values (auth.uid(), p_user, p_user, p_event, p_night, p_reason, nullif(btrim(p_note), ''), p_now)
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.report_user(uuid, text, text, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.report_user(uuid, text, text, uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- H4: a subject tagged before the unlock (e.g. during the author's morning review) can see that
-- one shot early, privately, so they can hide it before anyone else does.
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_see_shot(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from shots sh
    join nights n on n.id = sh.night_id
    where sh.id = s
      and sh.status <> 'deleted'
      and (
        sh.author_id = auth.uid()
        or (
          exists (select 1 from night_members m where m.night_id = n.id and m.user_id = auth.uid())
          and sh.status in ('held', 'kept')
          and not public.blocked_either(auth.uid(), sh.author_id)
          and not exists (select 1 from reports r where r.shot_id = sh.id and r.reporter_id = auth.uid())
          and (
            -- everyone in the night, after the unlock, unless hidden
            (n.unlocked_at is not null and not sh.subject_hidden and not exists (select 1 from shot_hides h where h.shot_id = sh.id))
            -- the tagged subject, before the unlock: a private preview to veto it (they can hide it)
            or (n.unlocked_at is null and exists (select 1 from shot_tags t where t.shot_id = sh.id and t.subject_id = auth.uid() and t.status <> 'removed')
                and not exists (select 1 from shot_hides h where h.shot_id = sh.id and h.user_id = auth.uid()))
          )
        )
      )
  )
$$;

-- Hides now also work before the unlock for the tagged subject (the insert policy only requires
-- participation; RLS on the hide row is unchanged).

-- ---------------------------------------------------------------------------------------------
-- H1: a blocked crewmate can't see the night at all (no venue, title or who started it), and the
-- blocker is never locked out: the join only refuses the person who was blocked by a participant.
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_see_night(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from nights x
    where x.id = n
      and (
        exists (select 1 from night_members m where m.night_id = x.id and m.user_id = auth.uid())
        or (
          x.crew_id is not null
          and exists (select 1 from crew_members c where c.crew_id = x.crew_id and c.user_id = auth.uid())
          and not exists (select 1 from night_members m where m.night_id = x.id and public.blocked_either(auth.uid(), m.user_id))
        )
      )
  )
$$;

create or replace function public.nc_join(p_night uuid, p_via text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  select * into n from nights where id = p_night;
  if not found then perform nc_raise('unavailable'); end if;
  if exists (select 1 from night_members where night_id = p_night and user_id = auth.uid()) then return p_night; end if;
  -- Someone in the night blocked you → generic "unavailable". If *you* blocked someone in it, you
  -- may still join (mutual invisibility covers you); the blocker is never locked out.
  if exists (select 1 from night_members m join blocks b on b.blocker_id = m.user_id and b.blocked_id = auth.uid() where m.night_id = p_night) then
    perform nc_raise('unavailable');
  end if;
  if n.ended_at is not null then perform nc_raise('not_live'); end if;
  if public.in_live_night(auth.uid()) then perform nc_raise('already_in_live_night'); end if;
  if (select count(*) from night_members where night_id = p_night) >= 30 then perform nc_raise('full'); end if;
  insert into night_members (night_id, user_id, via, joined_at) values (p_night, auth.uid(), p_via, p_now);
  -- H2: whoever started the night hears about anyone who came in by code or link.
  if p_via in ('code', 'invite') and n.started_by is not null then
    insert into notifications (user_id, kind, payload, created_at)
    values (n.started_by, 'joined_your_night', jsonb_build_object('night_id', p_night, 'user_id', auth.uid(), 'via', p_via), p_now);
  end if;
  return p_night;
end $$;
revoke execute on function public.nc_join(uuid, text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- C1 + H2: hosts can remove anyone from a night (never deferred) and rotate the code (which also
-- revokes every night link). Only the starter or a crew owner.
-- ---------------------------------------------------------------------------------------------
create or replace function public.nc_is_host(n nights) returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce: crew_role() is NULL for non-members, and `not NULL` would let a guest through.
  select coalesce(n.started_by = auth.uid(), false) or coalesce(n.crew_id is not null and public.crew_role(n.crew_id) = 'owner', false)
$$;

create or replace function public.remove_from_night(p_night uuid, p_user uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  p_now := public.nc_now(p_now);
  select * into n from nights where id = p_night;
  if not found or not public.is_participant(p_night) then perform nc_raise('not_found'); end if;
  if not public.nc_is_host(n) then perform nc_raise('not_allowed'); end if;
  if p_user = auth.uid() then perform nc_raise('invalid'); end if;
  delete from night_members where night_id = p_night and user_id = p_user;
  update invites set revoked_at = p_now where night_id = p_night and created_by = p_user and revoked_at is null;
end $$;

create or replace function public.rotate_night_code(p_night uuid, p_code text, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  p_now := public.nc_now(p_now);
  select * into n from nights where id = p_night;
  if not found or not public.is_participant(p_night) then perform nc_raise('not_found'); end if;
  if not public.nc_is_host(n) then perform nc_raise('not_allowed'); end if;
  if n.ended_at is not null then perform nc_raise('not_live'); end if;
  update nights set join_code = p_code where id = p_night;
  update invites set revoked_at = p_now where night_id = p_night and revoked_at is null;
end $$;

-- H2: only the host or crew members can make night links (guests can't re-share), max 10 uses.
create or replace function public.create_invite(p_kind text, p_target uuid, p_token_hash text, p_expires timestamptz, p_max_uses int, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  iid uuid;
  n nights%rowtype;
begin
  p_now := public.nc_now(p_now);
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if p_kind = 'crew' then
    if not public.is_crew_member(p_target) then perform nc_raise('not_member'); end if;
    insert into invites (kind, crew_id, token_hash, created_by, expires_at, max_uses, created_at)
    values ('crew', p_target, p_token_hash, auth.uid(), p_expires, p_max_uses, p_now) returning id into iid;
  elsif p_kind = 'night' then
    select * into n from nights where id = p_target;
    if not found or not public.is_participant(p_target) then perform nc_raise('not_member'); end if;
    if not (public.nc_is_host(n) or coalesce(n.crew_id is not null and public.is_crew_member(n.crew_id), false)) then perform nc_raise('not_allowed'); end if;
    if n.ended_at is not null then perform nc_raise('not_live'); end if;
    insert into invites (kind, night_id, token_hash, created_by, expires_at, max_uses, created_at)
    values ('night', p_target, p_token_hash, auth.uid(), p_expires, least(coalesce(p_max_uses, 10), 10), p_now) returning id into iid;
  else
    perform nc_raise('bad_kind');
  end if;
  return iid;
end $$;

revoke execute on function public.nc_is_host(nights) from public, anon;
revoke execute on function public.remove_from_night(uuid, uuid, timestamptz), public.rotate_night_code(uuid, text, timestamptz),
  public.create_invite(text, uuid, text, timestamptz, int, timestamptz) from public, anon;
grant execute on function public.nc_is_host(nights), public.remove_from_night(uuid, uuid, timestamptz),
  public.rotate_night_code(uuid, text, timestamptz), public.create_invite(text, uuid, text, timestamptz, int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- M2: leaving a City table keeps the seat history (for "met before" spreading) but revokes access.
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_at_table(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from city_table_members where table_id = t and user_id = auth.uid() and left_at is null)
$$;

create or replace function public.at_same_table(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from city_table_members a join city_table_members b on a.table_id = b.table_id
    where a.user_id = auth.uid() and b.user_id = other and a.left_at is null and b.left_at is null
  )
$$;

create or replace function public.were_tablemates(e uuid, other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from city_tables t
    join city_table_members a on a.table_id = t.id and a.user_id = auth.uid() and a.left_at is null
    join city_table_members b on b.table_id = t.id and b.user_id = other and b.left_at is null
    where t.event_id = e
  )
$$;

drop policy if exists city_table_members_select on public.city_table_members;
create policy city_table_members_select on public.city_table_members for select to authenticated using (
  public.is_at_table(table_id) and left_at is null and (user_id = auth.uid() or not public.blocked_either(auth.uid(), user_id))
);
