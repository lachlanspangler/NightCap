-- 0004 — Reaction set: 🥴 (woozy) out, 🌅 (sunrise, "it developed") in. Design review M1:
-- never judgmental about drinking (DRUNK_UX copy voice).
alter table public.reactions drop constraint if exists reactions_emoji_check;
update public.reactions set emoji = '🌅' where emoji = '🥴';
alter table public.reactions add constraint reactions_emoji_check check (emoji in ('🔥', '😂', '😍', '🌅', '🫶'));
