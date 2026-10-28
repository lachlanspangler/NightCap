-- 0003 — City Nights (MEET_PEOPLE.md): opt-in curated nights at public venues, tables of 4–8,
-- mutual "keep in touch" after. No browsing strangers, no DMs, no locations.

create table public.city_events (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city in ('minneapolis', 'chicago', 'nyc')),
  title text not null check (char_length(title) <= 60),
  theme text not null default 'mingle' check (theme in ('trivia', 'karaoke', 'crawl', 'music', 'mingle')),
  venue_name text not null check (char_length(venue_name) <= 60), -- a public venue, never a home
  venue_area text check (venue_area is null or char_length(venue_area) <= 60),
  starts_at timestamptz not null,
  table_min int not null default 4 check (table_min between 2 and 8),
  table_max int not null default 6 check (table_max between 2 and 10),
  tables_formed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (table_min <= table_max)
);
create index city_events_city_idx on public.city_events (city, starts_at);

create table public.city_signups (
  event_id uuid not null references public.city_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- People signing up together share a block_id and are seated together (crew-to-crew).
  block_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.city_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.city_events (id) on delete cascade,
  night_id uuid references public.nights (id) on delete set null,
  seat_label text not null default 'Table 1',
  created_at timestamptz not null default now()
);

create table public.city_table_members (
  table_id uuid not null references public.city_tables (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  left_at timestamptz,
  primary key (table_id, user_id)
);
create index city_table_members_user_idx on public.city_table_members (user_id);

create table public.keep_in_touch (
  event_id uuid not null references public.city_events (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  yes boolean not null,
  created_at timestamptz not null default now(),
  primary key (event_id, from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

-- Helpers ----------------------------------------------------------------------------------------
create or replace function public.city_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and city_opt_in and coc_accepted_at is not null and age_verified_at is not null and is_21_attested
  )
$$;

create or replace function public.at_same_table(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from city_table_members a join city_table_members b on a.table_id = b.table_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- Tablemates can see each other's first name + fun line (profiles_select uses shares_space).
create or replace function public.shares_space(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid()
    or exists (select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from night_members a join night_members b on a.night_id = b.night_id where a.user_id = auth.uid() and b.user_id = other)
    or public.at_same_table(other)
$$;

-- RLS --------------------------------------------------------------------------------------------
alter table public.city_events enable row level security;
alter table public.city_signups enable row level security;
alter table public.city_tables enable row level security;
alter table public.city_table_members enable row level security;
alter table public.keep_in_touch enable row level security;

grant select on public.city_events, public.city_tables, public.city_table_members to authenticated;
grant select, insert, delete on public.city_signups to authenticated;
grant select, insert, update on public.keep_in_touch to authenticated;
grant all on public.city_events, public.city_signups, public.city_tables, public.city_table_members, public.keep_in_touch to service_role;

create policy city_events_select on public.city_events for select to authenticated using (public.city_ok());

create policy city_signups_own on public.city_signups for select to authenticated using (user_id = auth.uid());
create policy city_signups_insert on public.city_signups for insert to authenticated with check (
  user_id = auth.uid() and public.city_ok()
  and exists (select 1 from public.city_events e where e.id = event_id and e.tables_formed_at is null)
);
create policy city_signups_delete on public.city_signups for delete to authenticated using (user_id = auth.uid());

create policy city_tables_select on public.city_tables for select to authenticated using (
  exists (select 1 from public.city_table_members m where m.table_id = id and m.user_id = auth.uid())
);
create policy city_table_members_select on public.city_table_members for select to authenticated using (
  exists (select 1 from public.city_table_members m where m.table_id = table_id and m.user_id = auth.uid())
  and (user_id = auth.uid() or not public.blocked_either(auth.uid(), user_id))
);

-- Keep in touch: you only ever see your own answers. Matches come from my_connections().
create policy kit_own on public.keep_in_touch for select to authenticated using (from_user_id = auth.uid());
create policy kit_insert on public.keep_in_touch for insert to authenticated with check (
  from_user_id = auth.uid()
  and exists (
    select 1 from public.city_tables t
    join public.city_table_members a on a.table_id = t.id and a.user_id = auth.uid()
    join public.city_table_members b on b.table_id = t.id and b.user_id = to_user_id
    where t.event_id = keep_in_touch.event_id
  )
);
create policy kit_update on public.keep_in_touch for update to authenticated
  using (from_user_id = auth.uid()) with check (from_user_id = auth.uid());

-- Mutual yes only. A "no" (or no answer) is indistinguishable from not matching.
create or replace function public.my_connections()
returns table (user_id uuid, display_name text, avatar_hue int, event_id uuid, since timestamptz)
language sql stable security definer set search_path = public as $$
  select other.id, other.display_name, other.avatar_hue, a.event_id, greatest(a.created_at, b.created_at)
  from keep_in_touch a
  join keep_in_touch b on b.event_id = a.event_id and b.from_user_id = a.to_user_id and b.to_user_id = a.from_user_id
  join profiles other on other.id = a.to_user_id
  where a.from_user_id = auth.uid() and a.yes and b.yes
    and not public.blocked_either(auth.uid(), a.to_user_id)
$$;

-- How many people have signed up (a number only: no names before the reveal).
create or replace function public.city_signup_count(p_event uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.city_ok() then (select count(*)::int from city_signups where event_id = p_event) else 0 end
$$;

grant execute on function public.city_ok(), public.at_same_table(uuid), public.my_connections(), public.city_signup_count(uuid) to authenticated;
