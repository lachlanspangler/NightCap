-- 0008 — Joining by code reveals nothing about the code (code review M1 #4). Every failure after
-- the code lookup returns null (→ "unavailable"), inside a sub-block so the attempt row commits
-- and counts toward the rate limit even for valid codes. "You're already in a night" is checked
-- by the API before any code is looked at, so it can't be used to test codes.
create or replace function public.join_night_by_code(p_code text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
  joined uuid;
begin
  p_now := public.nc_now(p_now);
  if auth.uid() is null then perform nc_raise('auth_required'); end if;
  if (select count(*) from code_attempts where user_id = auth.uid() and attempted_at > p_now - interval '10 minutes') >= 10 then
    perform nc_raise('rate_limited');
  end if;
  select id into nid from nights where join_code = p_code and ended_at is null;
  begin
    joined := case when nid is null then null else public.nc_join(nid, 'code', p_now) end;
  exception when others then
    joined := null;
  end;
  insert into code_attempts (user_id, attempted_at, ok) values (auth.uid(), p_now, joined is not null);
  return joined;
end $$;
revoke execute on function public.join_night_by_code(text, timestamptz) from public, anon;
grant execute on function public.join_night_by_code(text, timestamptz) to authenticated;
