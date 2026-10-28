-- 0005 — A hide must outlive the hider's account. shot_hides cascades with the profile, so a
-- person who hid a photo of themselves and then deleted their account would make it reappear.
-- `subject_hidden` is a sticky flag set when a hider's account is deleted (see API delete_account);
-- the visibility predicate treats it exactly like an active hide.
alter table public.shots add column if not exists subject_hidden boolean not null default false;

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
          and not public.blocked_either(auth.uid(), sh.author_id)
        )
      )
  )
$$;

create or replace function public.shot_hidden_from_others(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shots sh
    where sh.id = s and sh.author_id = auth.uid()
      and (sh.subject_hidden or exists (select 1 from shot_hides h where h.shot_id = sh.id))
  )
$$;

-- The shots guard allows only status changes after the unlock; subject_hidden is set by
-- service_role during account deletion, so let the guard ignore it.
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
  select n.unlocked_at is not null into unlocked from nights n where n.id = new.night_id;
  if unlocked and new.status <> old.status and new.status <> 'deleted' then
    raise exception 'after the unlock you can only delete' using errcode = '42501';
  end if;
  return new;
end $$;
