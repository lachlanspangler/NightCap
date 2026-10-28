-- 0001 — NightCap core schema: profiles, crews, nights, shots, consent, blocks, reports, invites.
--
-- Security model (ADR 0002):
--  * The API runs every user request as `authenticated` with request.jwt.claims set. RLS below is
--    the real gate for reads; writes go through narrow RLS policies or SECURITY DEFINER RPCs.
--  * Time never appears in RLS. Policies read persisted state (nights.ended_at / unlocked_at) that
--    only `service_role` (the API's advance step) writes.
--  * Clients never talk to Postgres directly (no PostgREST exposure); RPC parameters like p_now come
--    from the API's injected clock, and are still sanity-checked here.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  avatar_hue int not null default 280 check (avatar_hue between 0 and 359),
  birthdate date not null, -- private: column grants below hide it from `authenticated`
  is_21_attested boolean not null default false,
  age_verified_at timestamptz, -- ID verification (stubbed; dev toggle in mock mode)
  city text,
  city_opt_in boolean not null default false,
  coc_accepted_at timestamptz,
  gender text not null default 'unspecified' check (gender in ('woman', 'man', 'nonbinary', 'unspecified')),
  fun_line text check (fun_line is null or char_length(fun_line) <= 80),
  night_mode_pref text not null default 'auto' check (night_mode_pref in ('auto', 'always', 'never')),
  tz text not null default 'America/Chicago',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '🌙' check (char_length(emoji) between 1 and 8),
  kind text not null default 'local' check (kind in ('local', 'long_distance')),
  tz text not null default 'America/Chicago',
  moment_weekday int not null default 5 check (moment_weekday between 0 and 6),
  moment_hour int not null default 21 check (moment_hour between 0 and 23),
  moment_minute int not null default 0 check (moment_minute between 0 and 59),
  moment_duration_min int not null default 120 check (moment_duration_min between 30 and 1440),
  reunion_label text check (reunion_label is null or char_length(reunion_label) <= 40),
  reunion_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid references public.crews (id) on delete cascade,
  kind text not null default 'night' check (kind in ('night', 'moment', 'city')),
  title text check (title is null or char_length(title) <= 60),
  venue_label text check (venue_label is null or char_length(venue_label) <= 60),
  city text,
  tz text not null,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null,
  auto_end_at timestamptz not null,
  unlock_at timestamptz not null,
  earliest_unlock_at timestamptz not null,
  ended_at timestamptz,
  unlocked_at timestamptz,
  unlock_reason text check (unlock_reason in ('scheduled', 'everyone_ready', 'everyone_posted', 'window_closed')),
  join_code text check (join_code is null or join_code ~ '^\d{4}$'),
  roll_size int not null default 24 check (roll_size between 1 and 48),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (auto_end_at > started_at),
  check (unlock_at >= auto_end_at),
  check (earliest_unlock_at <= unlock_at),
  check (unlocked_at is null or ended_at is not null),
  check (kind = 'city' or crew_id is not null)
);
-- Codes are unique among live nights only (10,000 codes, reused after nights end).
create unique index nights_live_code_idx on public.nights (join_code) where ended_at is null and join_code is not null;
-- One live night per crew (moments are separate).
create unique index nights_one_live_per_crew_idx on public.nights (crew_id) where ended_at is null and kind = 'night';
create unique index nights_one_moment_per_window_idx on public.nights (crew_id, started_at) where kind = 'moment';
create index nights_crew_idx on public.nights (crew_id, started_at desc);

create table public.night_members (
  night_id uuid not null references public.nights (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  via text not null default 'crew' check (via in ('starter', 'crew', 'code', 'invite', 'table', 'moment')),
  joined_at timestamptz not null,
  ready_at timestamptz,
  primary key (night_id, user_id)
);
create index night_members_user_idx on public.night_members (user_id);

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  media_key text not null,
  mime text not null default 'image/jpeg' check (mime in ('image/jpeg', 'image/png')),
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  bytes int check (bytes is null or bytes between 1 and 12582912),
  taken_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'kept', 'discarded', 'deleted')),
  reviewed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index shots_night_idx on public.shots (night_id, taken_at);
create index shots_author_idx on public.shots (author_id);

create table public.shot_hides (
  shot_id uuid not null references public.shots (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default 'me' check (reason in ('me', 'report')),
  created_at timestamptz not null default now(),
  primary key (shot_id, user_id)
);

create table public.shot_tags (
  shot_id uuid not null references public.shots (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  tagger_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shot_id, subject_id)
);
create index shot_tags_subject_idx on public.shot_tags (subject_id, status);

create table public.reactions (
  shot_id uuid not null references public.shots (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '😂', '😍', '🥴', '🫶')),
  created_at timestamptz not null default now(),
  primary key (shot_id, user_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  shot_id uuid references public.shots (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('in_photo', 'nudity', 'minor', 'harassment', 'violence', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (shot_id is not null or reported_user_id is not null)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crew', 'night')),
  crew_id uuid references public.crews (id) on delete cascade,
  night_id uuid references public.nights (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'crew' and crew_id is not null) or (kind = 'night' and night_id is not null))
);

create table public.code_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null,
  ok boolean not null default false
);
create index code_attempts_user_idx on public.code_attempts (user_id, attempted_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null,
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.deferred_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('leave_crew', 'delete_account', 'remove_member', 'delete_crew')),
  payload jsonb not null default '{}',
  created_at timestamptz not null,
  ask_at timestamptz not null,
  resolved_at timestamptz,
  resolution text check (resolution in ('confirmed', 'cancelled'))
);

create table public.nudges_sent (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  about_user_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('quiet_friend', 'moment_closing')),
  sent_at timestamptz not null
);

-- ---------------------------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER: they read across RLS; each returns only a boolean)
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_crew_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_members where crew_id = c and user_id = auth.uid())
$$;

create or replace function public.crew_role(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from crew_members where crew_id = c and user_id = auth.uid()
$$;

create or replace function public.is_participant(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from night_members where night_id = n and user_id = auth.uid())
$$;

create or replace function public.blocked_either(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function public.can_see_night(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from nights x
    where x.id = n
      and (
        exists (select 1 from night_members m where m.night_id = x.id and m.user_id = auth.uid())
        or (x.crew_id is not null and exists (select 1 from crew_members c where c.crew_id = x.crew_id and c.user_id = auth.uid()))
      )
  )
$$;

-- The ADR 0004 predicate. Must match packages/core/src/album.ts → canSeeShot (shared fixture test).
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
          and not exists (select 1 from shot_hides h where h.shot_id = sh.id)
          and not public.blocked_either(auth.uid(), sh.author_id)
        )
      )
  )
$$;

-- Author-only: "hidden by someone in it" (never says who).
create or replace function public.shot_hidden_from_others(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shots sh
    where sh.id = s and sh.author_id = auth.uid()
      and exists (select 1 from shot_hides h where h.shot_id = sh.id)
  )
$$;

-- People you share a space with (crew, night or city table) can see your display name.
create or replace function public.shares_space(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid()
    or exists (select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from night_members a join night_members b on a.night_id = b.night_id where a.user_id = auth.uid() and b.user_id = other)
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants (RLS narrows these). `anon` gets nothing: there is no public surface.
-- ---------------------------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;

grant select (id, display_name, avatar_hue, city, fun_line, is_demo, created_at) on public.profiles to authenticated;
grant update (display_name, avatar_hue, city, city_opt_in, coc_accepted_at, gender, fun_line, night_mode_pref, tz) on public.profiles to authenticated;
grant select on public.crews, public.crew_members, public.nights, public.night_members to authenticated;
grant update (name, emoji, kind, tz, moment_weekday, moment_hour, moment_minute, moment_duration_min, reunion_label, reunion_at) on public.crews to authenticated;
grant update (muted_until) on public.crew_members to authenticated;
grant delete on public.crew_members to authenticated;
grant select, insert on public.shots to authenticated;
grant update (status, reviewed_at) on public.shots to authenticated;
grant select, insert, delete on public.shot_hides to authenticated;
grant select, insert on public.shot_tags to authenticated;
grant update (status, updated_at) on public.shot_tags to authenticated;
grant select, insert, update, delete on public.reactions to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select on public.invites to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.deferred_actions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.nights enable row level security;
alter table public.night_members enable row level security;
alter table public.shots enable row level security;
alter table public.shot_hides enable row level security;
alter table public.shot_tags enable row level security;
alter table public.reactions enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.invites enable row level security;
alter table public.code_attempts enable row level security;
alter table public.notifications enable row level security;
alter table public.deferred_actions enable row level security;
alter table public.nudges_sent enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (public.shares_space(id));
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy crews_select on public.crews for select to authenticated using (public.is_crew_member(id));
create policy crews_update_owner on public.crews for update to authenticated
  using (public.crew_role(id) = 'owner') with check (public.crew_role(id) = 'owner');

create policy crew_members_select on public.crew_members for select to authenticated using (public.is_crew_member(crew_id));
create policy crew_members_update_own on public.crew_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Leaving is a delete of your own row; owners may remove others. (Night mode defers both: API, ADR DRUNK_UX.)
create policy crew_members_delete on public.crew_members for delete to authenticated
  using (user_id = auth.uid() or public.crew_role(crew_id) = 'owner');

create policy nights_select on public.nights for select to authenticated using (public.can_see_night(id));

create policy night_members_select on public.night_members for select to authenticated
  using (public.can_see_night(night_id) and (user_id = auth.uid() or not public.blocked_either(auth.uid(), user_id)));

-- Authors' own rows are matched inline (not via can_see_shot) so INSERT … RETURNING works: a STABLE
-- function's snapshot can't see the row being inserted.
create policy shots_select on public.shots for select to authenticated
  using ((author_id = auth.uid() and status <> 'deleted') or public.can_see_shot(id));
create policy shots_insert on public.shots for insert to authenticated with check (
  author_id = auth.uid()
  and status = 'held'
  and public.is_participant(night_id)
  and exists (select 1 from public.nights n where n.id = night_id and n.ended_at is null)
  and (select count(*) from public.shots s where s.night_id = shots.night_id and s.author_id = auth.uid())
      < (select n.roll_size from public.nights n where n.id = night_id)
);
create policy shots_update_own on public.shots for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy shot_hides_select_own on public.shot_hides for select to authenticated using (user_id = auth.uid());
create policy shot_hides_insert on public.shot_hides for insert to authenticated with check (
  user_id = auth.uid()
  and reason = 'me'
  and exists (
    select 1 from public.shots s
    where s.id = shot_id and s.author_id <> auth.uid() and public.is_participant(s.night_id)
  )
);
create policy shot_hides_delete_own on public.shot_hides for delete to authenticated using (user_id = auth.uid() and reason = 'me');

-- Subjects always see their own tags (it's their decision, incl. removed ones); taggers see pending;
-- everyone else sees only approved tags on shots they can see.
create policy shot_tags_select on public.shot_tags for select to authenticated using (
  subject_id = auth.uid()
  or (status = 'pending' and tagger_id = auth.uid())
  or (status = 'approved' and public.can_see_shot(shot_id))
);
create policy shot_tags_insert on public.shot_tags for insert to authenticated with check (
  tagger_id = auth.uid()
  and exists (
    select 1 from public.shots s
    where s.id = shot_id
      and public.is_participant(s.night_id)
      and exists (select 1 from public.night_members m where m.night_id = s.night_id and m.user_id = subject_id)
      and not public.blocked_either(auth.uid(), subject_id)
  )
  and status = (case when subject_id = auth.uid() then 'approved' else 'pending' end)
);
create policy shot_tags_update_subject on public.shot_tags for update to authenticated
  using (subject_id = auth.uid()) with check (subject_id = auth.uid());

create policy reactions_select on public.reactions for select to authenticated
  using (public.can_see_shot(shot_id) and (user_id = auth.uid() or not public.blocked_either(auth.uid(), user_id)));
create policy reactions_write on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_shot(shot_id));
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_shot(shot_id));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy reports_select_own on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = auth.uid());

create policy invites_select_creator on public.invites for select to authenticated using (created_by = auth.uid());

create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy deferred_own on public.deferred_actions for select to authenticated using (user_id = auth.uid());
-- code_attempts, nudges_sent: no policies for authenticated → no access (service_role only).

-- ---------------------------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------------------------
-- Shot status transitions: held/kept/discarded are review states before the unlock; after the
-- unlock the only change is → deleted. Deleted is final.
create or replace function public.shots_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  unlocked boolean;
begin
  if new.night_id <> old.night_id or new.author_id <> old.author_id or new.media_key <> old.media_key or new.taken_at <> old.taken_at then
    raise exception 'shot identity is immutable' using errcode = '42501';
  end if;
  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception 'deleted shots stay deleted' using errcode = '42501';
  end if;
  select n.unlocked_at is not null into unlocked from nights n where n.id = new.night_id;
  if unlocked and new.status <> old.status and new.status <> 'deleted' then
    raise exception 'after the unlock you can only delete' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger shots_guard before update on public.shots for each row execute function public.shots_guard();

-- Tags: only the status may change, and a removed tag stays removed (re-tag = new decision by subject).
create or replace function public.shot_tags_guard() returns trigger
language plpgsql as $$
begin
  if new.shot_id <> old.shot_id or new.subject_id <> old.subject_id or new.tagger_id <> old.tagger_id then
    raise exception 'tag identity is immutable' using errcode = '42501';
  end if;
  if old.status = 'removed' and new.status <> 'removed' then
    raise exception 'removed tags stay removed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger shot_tags_guard before update on public.shot_tags for each row execute function public.shot_tags_guard();
