-- Migration: "not for me" place feedback. Needed by the same release as Saved
-- (Saving a place checks it, and hard-excluding a place removes it from Saved),
-- and not covered by the Saved migration. Safe on the current production schema
-- and safe to run more than once; touches only place_feedback.

begin;

-- ---------------------------------------------------------------------------
-- place_feedback — "not for me" on a real nearby place. Personal and
-- per-user: the user's own opinion, never a public or verified fact about the
-- place. Keyed by the provider's place id (plus the provider), never the
-- name. meal_feedback can't hold this: it is one write-once row per session
-- about "did you eat it", with no place id. `action` is derived from `reason`
-- in app code (places/feedback.ts); one row per place, latest answer wins.
--   exclude  — never recommend this place to this user (until they undo it)
--   downrank — rank it lower; still eligible
-- ---------------------------------------------------------------------------
create table if not exists public.place_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  provider    text        not null default 'google_places',
  place_id    text        not null,
  action      text        not null check (action in ('exclude', 'downrank')),
  reason      text        not null check (reason in ('closed', 'dont_like', 'too_expensive', 'bad_experience', 'other')),
  created_at  timestamptz not null default now(),
  unique (user_id, provider, place_id)
);

alter table public.place_feedback enable row level security;

drop policy if exists "own place feedback" on public.place_feedback;
create policy "own place feedback" on public.place_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.place_feedback to authenticated;

commit;
