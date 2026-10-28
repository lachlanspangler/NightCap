-- 0000 — Supabase shim (PGlite / plain Postgres only; skipped on real Supabase, ADR 0002).
-- Recreates the bits of Supabase our migrations rely on: the auth schema, auth.users, auth.uid()
-- reading request.jwt.claims, and the anon / authenticated / service_role roles.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns json
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::json
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant insert, delete on auth.users to service_role;

-- PGlite / mock mode only: the API's dev clock (time travel) may pass any p_now. On Supabase this
-- shim never runs, so 0007's default (false) applies and p_now is clamped to the DB clock.
create or replace function public.nc_clock_override_allowed() returns boolean
language sql immutable as $$ select true $$;
