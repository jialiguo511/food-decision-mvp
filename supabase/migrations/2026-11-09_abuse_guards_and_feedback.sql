-- Migration: public-beta cost guards + the feedback form. Safe to run more than once.
-- Run it AFTER 2026-11-07_usage_and_events.sql and BEFORE deploying the code that uses it.
--
-- What it adds
--   1. global_usage       — one counter per (UTC day, kind of paid call) for the WHOLE app.
--                           A hard daily ceiling on what any number of accounts can spend,
--                           so many sign-ups cannot multiply the per-person limit.
--   2. app_flags          — a tiny switchboard the owner edits from the SQL editor. The only
--                           flag read today is `paused_kinds` ('all' or e.g. 'recommend,image'):
--                           it stops that paid call at once, with no redeploy.
--   3. (consume_usage()    — was replaced here by a version that also checks (1) and (2); that
--                           function now lives, server-only, in 2026-11-10_server_only_writes.sql.)
--   4. feedback           — what the in-app "Send feedback" form writes. Own rows only.
--
-- Impact: no existing table is altered, no row is rewritten. Rollback is in the comment
-- at the bottom. Back up first anyway (Supabase dashboard → Database → Backups).
begin;

-- ---------------------------------------------------------------------------
-- global_usage + app_flags — owner-only: RLS on, no policy, no grant
-- ---------------------------------------------------------------------------
create table if not exists public.global_usage (
  day   date    not null,
  kind  text    not null check (kind ~ '^[a-z_]{1,32}$'),
  count integer not null default 0 check (count >= 0),
  primary key (day, kind)
);
alter table public.global_usage enable row level security;
revoke all on public.global_usage from anon, authenticated;

create table if not exists public.app_flags (
  key   text primary key check (key ~ '^[a-z_]{1,40}$'),
  value text not null default ''
);
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;
insert into public.app_flags (key, value) values ('paused_kinds', '') on conflict (key) do nothing;

-- consume_usage() is NOT defined here any more: the server-only version (user id as an argument,
-- executable by service_role only) is in 2026-11-10_server_only_writes.sql.

-- ---------------------------------------------------------------------------
-- feedback — "Send feedback". The kind, the message, an optional contact the person
-- chose to give, the page path and the app version. Never a screenshot, never the
-- sentence they typed on Home. Own rows only; read it yourself from the SQL editor.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null check (kind in ('bug', 'idea', 'other')),
  message     text        not null check (char_length(message) between 1 and 2000),
  contact     text        check (contact is null or char_length(contact) <= 200),
  page        text        check (page is null or char_length(page) <= 80),
  app_version text        check (app_version is null or char_length(app_version) <= 40),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;
drop policy if exists "own feedback form" on public.feedback;
create policy "own feedback form" on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on public.feedback to authenticated;

commit;

-- ROLLBACK (only if needed; run by hand):
--   drop table if exists public.feedback, public.global_usage, public.app_flags;
