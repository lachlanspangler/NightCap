-- 0002 — RPCs: multi-row writes with business rules. SECURITY DEFINER, narrow arguments, every
-- one re-checks membership with auth.uid(). Time arrives as p_now from the API's injected clock
-- (ADR 0002/0003); schedule timestamps are computed by @nightcap/core and sanity-checked here.

-- Errors use SQLSTATE P0001 with a stable message the API maps to an HTTP error code.

create or replace function public.nc_raise(code text) returns void
language plpgsql as $$ begin raise exception '%', code using errcode = 'P0001'; end $$;

create or replace function public.in_live_night(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from night_members m join nights n on n.id = m.night_id
    where m.user_id = u and n.ended_at is null and n.kind <> 'moment'
  )
$$;

-- Crews ----------------------------------------------------------------------------------------
create or replace function public.create_crew(p_name text, p_emoji text, p_kind text, p_tz text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  insert into crews (name, emoji, kind, tz, created_by, created_at)
  values (btrim(p_name), coalesce(nullif(p_emoji, ''), '🌙'), coalesce(p_kind, 'local'), p_tz, auth.uid(), p_now)
  returning id into cid;
  insert into crew_members (crew_id, user_id, role, joined_at) values (cid, auth.uid(), 'owner', p_now);
  return cid;
end $$;

-- Nights ---------------------------------------------------------------------------------------
create or replace function public.start_night(
  p_crew uuid, p_title text, p_venue text, p_tz text, p_now timestamptz,
  p_auto_end timestamptz, p_unlock timestamptz, p_earliest timestamptz, p_code text, p_roll int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if not exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid()) then perform nc_raise('not_member'); end if;
  if exists (select 1 from nights where crew_id = p_crew and ended_at is null and kind = 'night') then perform nc_raise('crew_has_live_night'); end if;
  if public.in_live_night(auth.uid()) then perform nc_raise('already_in_live_night'); end if;
  if p_unlock < p_now + interval '6 hours' or p_auto_end <= p_now or p_auto_end > p_now + interval '12 hours' then
    perform nc_raise('bad_schedule');
  end if;
  insert into nights (crew_id, kind, title, venue_label, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, join_code, roll_size, city)
  values (p_crew, 'night', nullif(btrim(p_title), ''), nullif(btrim(p_venue), ''), p_tz, auth.uid(), p_now, p_auto_end, p_unlock, p_earliest, p_code, p_roll,
          (select city from profiles where id = auth.uid()))
  returning id into nid;
  insert into night_members (night_id, user_id, via, joined_at) values (nid, auth.uid(), 'starter', p_now);
  insert into notifications (user_id, kind, payload, created_at)
  select m.user_id, 'night_started', jsonb_build_object('night_id', nid, 'crew_id', p_crew, 'by', auth.uid()), p_now
  from crew_members m where m.crew_id = p_crew and m.user_id <> auth.uid()
    and not public.blocked_either(auth.uid(), m.user_id);
  return nid;
end $$;

-- Internal: the shared join path. Blocks → 'unavailable' (same as a wrong code).
create or replace function public.nc_join(p_night uuid, p_via text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  select * into n from nights where id = p_night;
  if not found then perform nc_raise('unavailable'); end if;
  if exists (select 1 from night_members where night_id = p_night and user_id = auth.uid()) then return p_night; end if;
  if exists (select 1 from night_members m where m.night_id = p_night and public.blocked_either(auth.uid(), m.user_id)) then
    perform nc_raise('unavailable');
  end if;
  if n.ended_at is not null then perform nc_raise('not_live'); end if;
  if public.in_live_night(auth.uid()) then perform nc_raise('already_in_live_night'); end if;
  if (select count(*) from night_members where night_id = p_night) >= 30 then perform nc_raise('full'); end if;
  insert into night_members (night_id, user_id, via, joined_at) values (p_night, auth.uid(), p_via, p_now);
  return p_night;
end $$;
revoke execute on function public.nc_join(uuid, text, timestamptz) from public, authenticated;

create or replace function public.join_crew_night(p_night uuid, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if not exists (
    select 1 from nights n join crew_members c on c.crew_id = n.crew_id
    where n.id = p_night and c.user_id = auth.uid()
  ) then perform nc_raise('no_access'); end if;
  return public.nc_join(p_night, 'crew', p_now);
end $$;

create or replace function public.join_night_by_code(p_code text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if (select count(*) from code_attempts where user_id = auth.uid() and attempted_at > p_now - interval '10 minutes') >= 10 then
    perform nc_raise('rate_limited');
  end if;
  select id into nid from nights where join_code = p_code and ended_at is null;
  insert into code_attempts (user_id, attempted_at, ok) values (auth.uid(), p_now, nid is not null);
  -- A wrong code returns null instead of raising, so the attempt above isn't rolled back (the API
  -- maps null → 'unavailable', the same error a blocked person gets).
  if nid is null then return null; end if;
  return public.nc_join(nid, 'code', p_now);
end $$;

create or replace function public.end_night(p_night uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  select * into n from nights where id = p_night;
  if not found or not public.can_see_night(p_night) then perform nc_raise('not_found'); end if;
  if n.ended_at is not null then perform nc_raise('not_live'); end if;
  if n.started_by is distinct from auth.uid() and public.crew_role(n.crew_id) is distinct from 'owner' then perform nc_raise('not_allowed'); end if;
  update nights set ended_at = greatest(p_now, started_at + interval '1 second') where id = p_night;
end $$;

create or replace function public.mark_ready(p_night uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  select * into n from nights where id = p_night;
  if not found or not public.is_participant(p_night) then perform nc_raise('not_found'); end if;
  if n.ended_at is null or n.unlocked_at is not null then perform nc_raise('not_developing'); end if;
  update night_members set ready_at = p_now where night_id = p_night and user_id = auth.uid();
end $$;

-- service_role only: persist a transition computed by core's advanceNight().
create or replace function public.apply_night_advance(p_night uuid, p_ended_at timestamptz, p_unlocked_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update nights set
    ended_at = coalesce(ended_at, p_ended_at),
    unlocked_at = coalesce(unlocked_at, p_unlocked_at),
    unlock_reason = coalesce(unlock_reason, p_reason)
  where id = p_night;
  if p_unlocked_at is not null then
    insert into notifications (user_id, kind, payload, created_at)
    select m.user_id, 'album_ready', jsonb_build_object('night_id', p_night), p_unlocked_at
    from night_members m where m.night_id = p_night
      and not exists (select 1 from notifications x where x.user_id = m.user_id and x.kind = 'album_ready' and x.payload->>'night_id' = p_night::text);
  end if;
end $$;
revoke execute on function public.apply_night_advance(uuid, timestamptz, timestamptz, text) from public, authenticated;
grant execute on function public.apply_night_advance(uuid, timestamptz, timestamptz, text) to service_role;

-- Invites --------------------------------------------------------------------------------------
create or replace function public.create_invite(p_kind text, p_target uuid, p_token_hash text, p_expires timestamptz, p_max_uses int, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  iid uuid;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if p_kind = 'crew' then
    if not public.is_crew_member(p_target) then perform nc_raise('not_member'); end if;
    insert into invites (kind, crew_id, token_hash, created_by, expires_at, max_uses, created_at)
    values ('crew', p_target, p_token_hash, auth.uid(), p_expires, p_max_uses, p_now) returning id into iid;
  elsif p_kind = 'night' then
    if not public.is_participant(p_target) then perform nc_raise('not_member'); end if;
    if exists (select 1 from nights where id = p_target and ended_at is not null) then perform nc_raise('not_live'); end if;
    insert into invites (kind, night_id, token_hash, created_by, expires_at, max_uses, created_at)
    values ('night', p_target, p_token_hash, auth.uid(), p_expires, p_max_uses, p_now) returning id into iid;
  else
    perform nc_raise('bad_kind');
  end if;
  return iid;
end $$;

create or replace function public.revoke_invite(p_invite uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update invites set revoked_at = p_now where id = p_invite and created_by = auth.uid() and revoked_at is null;
  if not found then perform nc_raise('not_found'); end if;
end $$;

create or replace function public.redeem_invite(p_token_hash text, p_now timestamptz)
returns json language plpgsql security definer set search_path = public as $$
declare
  i invites%rowtype;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  select * into i from invites where token_hash = p_token_hash for update;
  if not found then perform nc_raise('invalid_invite'); end if;
  if i.revoked_at is not null then perform nc_raise('revoked'); end if;
  if p_now >= i.expires_at then perform nc_raise('expired'); end if;
  if i.max_uses is not null and i.uses >= i.max_uses then perform nc_raise('used_up'); end if;
  if public.blocked_either(auth.uid(), i.created_by) then perform nc_raise('invalid_invite'); end if;
  if i.kind = 'crew' then
    if not exists (select 1 from crew_members where crew_id = i.crew_id and user_id = auth.uid()) then
      if (select count(*) from crew_members where crew_id = i.crew_id) >= 20 then perform nc_raise('crew_full'); end if;
      insert into crew_members (crew_id, user_id, role, joined_at) values (i.crew_id, auth.uid(), 'member', p_now);
      update invites set uses = uses + 1 where id = i.id;
    end if;
    return json_build_object('kind', 'crew', 'crew_id', i.crew_id);
  else
    perform public.nc_join(i.night_id, 'invite', p_now);
    update invites set uses = uses + 1 where id = i.id;
    return json_build_object('kind', 'night', 'night_id', i.night_id);
  end if;
end $$;

-- Safety ---------------------------------------------------------------------------------------
-- Reports: subject categories (in_photo, nudity, minor) hide the shot for everyone pending review.
create or replace function public.report_shot(p_shot uuid, p_reason text, p_note text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  s shots%rowtype;
begin
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  select * into s from shots where id = p_shot;
  if not found or not public.is_participant(s.night_id) then perform nc_raise('not_found'); end if;
  insert into reports (reporter_id, shot_id, reported_user_id, reason, note, created_at)
  values (auth.uid(), p_shot, s.author_id, p_reason, nullif(btrim(p_note), ''), p_now) returning id into rid;
  if p_reason in ('in_photo', 'nudity', 'minor') then
    insert into shot_hides (shot_id, user_id, reason, created_at) values (p_shot, auth.uid(), 'report', p_now)
    on conflict (shot_id, user_id) do update set reason = 'report';
  end if;
  return rid;
end $$;

-- Is the caller's view of a user's name allowed? (Used by the album to resolve author names.)
create or replace function public.night_participants(p_night uuid)
returns table (user_id uuid, display_name text, avatar_hue int, ready boolean, joined_at timestamptz, via text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, p.avatar_hue, m.ready_at is not null, m.joined_at, m.via
  from night_members m join profiles p on p.id = m.user_id
  where m.night_id = p_night and public.can_see_night(p_night)
    and (m.user_id = auth.uid() or not public.blocked_either(auth.uid(), m.user_id))
  order by m.joined_at
$$;

-- Teaser counts for participants: shots that will be released, per author, blocked authors excluded.
create or replace function public.night_counts(p_night uuid)
returns table (user_id uuid, shots int)
language sql stable security definer set search_path = public as $$
  select m.user_id, count(s.id)::int
  from night_members m
  left join shots s on s.night_id = m.night_id and s.author_id = m.user_id and s.status in ('held', 'kept')
  where m.night_id = p_night and public.is_participant(p_night)
    and (m.user_id = auth.uid() or not public.blocked_either(auth.uid(), m.user_id))
  group by m.user_id
$$;

grant execute on function public.create_crew(text, text, text, text, timestamptz),
  public.start_night(uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, int),
  public.join_crew_night(uuid, timestamptz), public.join_night_by_code(text, timestamptz),
  public.end_night(uuid, timestamptz), public.mark_ready(uuid, timestamptz),
  public.create_invite(text, uuid, text, timestamptz, int, timestamptz), public.revoke_invite(uuid, timestamptz),
  public.redeem_invite(text, timestamptz), public.report_shot(uuid, text, text, timestamptz),
  public.night_participants(uuid), public.night_counts(uuid)
to authenticated;
