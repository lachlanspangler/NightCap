-- 0010 — Functions created by future migrations are not executable by PUBLIC by default (code
-- review M1 R2-4). Each migration still grants what `authenticated` needs explicitly.
alter default privileges in schema public revoke execute on functions from public;
