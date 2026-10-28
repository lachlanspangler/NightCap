-- 0006 — City Night groups need the friend's say-so (code review M1 #2). To sit with a friend,
-- they invite you when they sign up; you can only join a block you were invited to, and never
-- someone you've blocked or who blocked you. Service-role only (the API checks and writes it).
create table public.city_block_invites (
  event_id uuid not null references public.city_events (id) on delete cascade,
  block_id uuid not null,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, invitee_id, block_id)
);
alter table public.city_block_invites enable row level security;
grant all on public.city_block_invites to service_role;
-- No policies for authenticated: invisible to clients.
