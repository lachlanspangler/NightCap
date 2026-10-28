-- 0009 — Code review M1 fixes:
--  #9  a report always hides the shot from the reporter (ADR 0004), whatever the reason
--  #8  races: the roll limit is enforced under a row lock; reviews lock the night row
--  #8c album_ready notifications can't be duplicated
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
          and n.unlocked_at is not null
          and sh.status in ('held', 'kept')
          and not sh.subject_hidden
          and not exists (select 1 from shot_hides h where h.shot_id = sh.id)
          and not exists (select 1 from reports r where r.shot_id = sh.id and r.reporter_id = auth.uid())
          and not public.blocked_either(auth.uid(), sh.author_id)
        )
      )
  )
$$;

-- Roll limit under concurrency: serialise inserts per (night, author) on the member row.
create or replace function public.shots_roll_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  limit_ int;
  taken int;
begin
  perform 1 from night_members where night_id = new.night_id and user_id = new.author_id for update;
  select roll_size into limit_ from nights where id = new.night_id for share;
  select count(*) into taken from shots where night_id = new.night_id and author_id = new.author_id;
  if taken >= limit_ then
    raise exception 'roll_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists shots_roll_guard on public.shots;
create trigger shots_roll_guard before insert on public.shots for each row execute function public.shots_roll_guard();

-- Reviews and the unlock can't interleave: the status guard takes a share lock on the night.
create or replace function public.shots_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  unlocked boolean;
begin
  if new.night_id <> old.night_id or new.author_id <> old.author_id or new.media_key <> old.media_key or new.taken_at <> old.taken_at then
    raise exception 'shot identity is immutable' using errcode = '42501';
  end if;
  if old.subject_hidden and not new.subject_hidden then
    raise exception 'a subject hide is permanent' using errcode = '42501';
  end if;
  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception 'deleted shots stay deleted' using errcode = '42501';
  end if;
  select n.unlocked_at is not null into unlocked from nights n where n.id = new.night_id for share;
  if unlocked and new.status <> old.status and new.status <> 'deleted' then
    raise exception 'after the unlock you can only delete' using errcode = '42501';
  end if;
  return new;
end $$;

create unique index if not exists notifications_album_ready_once on public.notifications (user_id, (payload ->> 'night_id')) where kind = 'album_ready';
revoke execute on function public.shots_roll_guard() from public, anon;

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
    on conflict (user_id, (payload ->> 'night_id')) where kind = 'album_ready' do nothing;
  end if;
end $$;
revoke execute on function public.apply_night_advance(uuid, timestamptz, timestamptz, text) from public, authenticated, anon;
grant execute on function public.apply_night_advance(uuid, timestamptz, timestamptz, text) to service_role;
