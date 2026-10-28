-- 0012 — Privacy review M1, round 2.

-- R2-1: the subject preview happens only in the morning review (night ended, not yet unlocked) and
-- only for tags the *author* made. Before the unlock nobody but the author can tag, so a subject
-- can't pass an unreviewed shot on.
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
            (n.unlocked_at is not null and not sh.subject_hidden and not exists (select 1 from shot_hides h where h.shot_id = sh.id))
            or (
              n.ended_at is not null and n.unlocked_at is null
              and exists (select 1 from shot_tags t where t.shot_id = sh.id and t.subject_id = auth.uid() and t.tagger_id = sh.author_id and t.status <> 'removed')
              and not exists (select 1 from shot_hides h where h.shot_id = sh.id and h.user_id = auth.uid())
            )
          )
        )
      )
  )
$$;

drop policy if exists shot_tags_insert on public.shot_tags;
create policy shot_tags_insert on public.shot_tags for insert to authenticated with check (
  tagger_id = auth.uid()
  and exists (
    select 1 from public.shots s join public.nights n on n.id = s.night_id
    where s.id = shot_id
      and public.is_participant(s.night_id)
      and exists (select 1 from public.night_members m where m.night_id = s.night_id and m.user_id = subject_id)
      and not public.blocked_either(auth.uid(), subject_id)
      and (n.unlocked_at is not null or s.author_id = auth.uid())
  )
  and status = (case when subject_id = auth.uid() then 'approved' else 'pending' end)
);

-- R2-2: removing someone from a night is a ban for that night, and the code rotates.
create table if not exists public.night_bans (
  night_id uuid not null references public.nights (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (night_id, user_id)
);
alter table public.night_bans enable row level security;
grant all on public.night_bans to service_role;

create or replace function public.remove_from_night(p_night uuid, p_user uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
  attempt int := 0;
begin
  p_now := public.nc_now(p_now);
  select * into n from nights where id = p_night;
  if not found or not public.is_participant(p_night) then perform nc_raise('not_found'); end if;
  if not public.nc_is_host(n) then perform nc_raise('not_allowed'); end if;
  if p_user = auth.uid() then perform nc_raise('invalid'); end if;
  delete from night_members where night_id = p_night and user_id = p_user;
  insert into night_bans (night_id, user_id, banned_by, created_at) values (p_night, p_user, auth.uid(), p_now) on conflict do nothing;
  update invites set revoked_at = p_now where night_id = p_night and revoked_at is null;
  -- New code so the removed person can't walk back in with the one they heard.
  if n.ended_at is null then
    loop
      attempt := attempt + 1;
      begin
        update nights set join_code = lpad((floor(random() * 10000))::int::text, 4, '0') where id = p_night;
        exit;
      exception when unique_violation then
        if attempt > 40 then raise; end if;
      end;
    end loop;
  end if;
end $$;

-- R2-2 + R2-3: nc_join refuses the banned and anyone a participant blocked; never the blocker.
create or replace function public.nc_join(p_night uuid, p_via text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n nights%rowtype;
begin
  select * into n from nights where id = p_night;
  if not found then perform nc_raise('unavailable'); end if;
  if exists (select 1 from night_members where night_id = p_night and user_id = auth.uid()) then return p_night; end if;
  if exists (select 1 from night_bans where night_id = p_night and user_id = auth.uid()) then perform nc_raise('unavailable'); end if;
  if exists (select 1 from night_members m join blocks b on b.blocker_id = m.user_id and b.blocked_id = auth.uid() where m.night_id = p_night) then
    perform nc_raise('unavailable');
  end if;
  if n.ended_at is not null then perform nc_raise('not_live'); end if;
  if public.in_live_night(auth.uid()) then perform nc_raise('already_in_live_night'); end if;
  if (select count(*) from night_members where night_id = p_night) >= 30 then perform nc_raise('full'); end if;
  insert into night_members (night_id, user_id, via, joined_at) values (p_night, auth.uid(), p_via, p_now);
  if p_via in ('code', 'invite') and n.started_by is not null then
    insert into notifications (user_id, kind, payload, created_at)
    values (n.started_by, 'joined_your_night', jsonb_build_object('night_id', p_night, 'user_id', auth.uid(), 'via', p_via), p_now);
  end if;
  return p_night;
end $$;
revoke execute on function public.nc_join(uuid, text, timestamptz) from public, anon, authenticated;

-- R2-3: a crew night is hidden only from people a participant blocked (never from the blocker),
-- and from people banned from it.
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
          and not exists (select 1 from night_bans nb where nb.night_id = x.id and nb.user_id = auth.uid())
          and not exists (
            select 1 from night_members m join blocks b on b.blocker_id = m.user_id and b.blocked_id = auth.uid()
            where m.night_id = x.id
          )
        )
      )
  )
$$;

-- R2-5: reports survive the reporter deleting their account, and you can report anyone you've
-- shared a crew, night or table with, even after leaving.
alter table public.reports add column if not exists reporter_snapshot uuid;
update public.reports set reporter_snapshot = reporter_id where reporter_snapshot is null;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles (id) on delete set null;

create or replace function public.ever_shared(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.shares_space(other)
    or exists (select 1 from city_table_members a join city_table_members b on a.table_id = b.table_id where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from night_members a join night_members b on a.night_id = b.night_id where a.user_id = auth.uid() and b.user_id = other)
$$;

create or replace function public.report_user(p_user uuid, p_reason text, p_note text, p_event uuid, p_night uuid, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  p_now := public.nc_now(p_now);
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if p_user = auth.uid() or not public.ever_shared(p_user) then perform nc_raise('not_found'); end if;
  insert into reports (reporter_id, reporter_snapshot, reported_user_id, reported_user_snapshot, event_id, night_id, reason, note, created_at)
  values (auth.uid(), auth.uid(), p_user, p_user, p_event, p_night, p_reason, nullif(btrim(p_note), ''), p_now)
  returning id into rid;
  return rid;
end $$;

create or replace function public.reports_snapshot_reporter() returns trigger
language plpgsql as $$
begin
  new.reporter_snapshot := coalesce(new.reporter_snapshot, new.reporter_id);
  return new;
end $$;
drop trigger if exists reports_snapshot_reporter on public.reports;
create trigger reports_snapshot_reporter before insert on public.reports for each row execute function public.reports_snapshot_reporter();

revoke execute on function public.ever_shared(uuid), public.reports_snapshot_reporter() from public, anon;
grant execute on function public.ever_shared(uuid), public.report_user(uuid, text, text, uuid, uuid, timestamptz), public.remove_from_night(uuid, uuid, timestamptz) to authenticated;
