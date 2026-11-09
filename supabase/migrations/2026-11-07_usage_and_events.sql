-- Migration: per-user daily usage limits + first-party product events (web beta).
-- Safe to run more than once. Touches only the two new tables; nothing existing is altered. Run it BEFORE deploying the code that
-- calls it (in production the app refuses paid requests without it — see
-- src/lib/usage/consume.ts).
--
-- usage_counters — one row per (user, UTC day, kind of paid call). The ONLY way
-- to change it is public.consume_usage() (now defined in 2026-11-10_server_only_writes.sql, callable
-- by the server only), a SECURITY DEFINER function that can only add one: the table has RLS on, no
-- policy and no grant, so a signed-in user cannot read it, reset it or edit it
-- through the API — "Reset my data" must not refund a day's allowance, and
-- this is why. The increment is one atomic statement, so concurrent requests
-- cannot slip past the limit, and failed requests still count (they were paid
-- for upstream). Deliberately NOT in accountData.ts's USER_TABLES.
--
-- product_events — a small first-party event log (names allow-listed by a CHECK;
-- props are small JSON of enumerated values and numbers — never free text,
-- health information or coordinates; see src/lib/events/schema.ts). Owned by the
-- user, so Reset / Delete account clear it (it IS in USER_TABLES). Read it from
-- the SQL editor with supabase/metrics.sql.

begin;

-- ---------------------------------------------------------------------------
-- usage_counters + consume_usage()
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null,
  kind    text    not null check (kind ~ '^[a-z_]{1,32}$'),
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

alter table public.usage_counters enable row level security;
revoke all on public.usage_counters from anon, authenticated;

-- consume_usage() is NOT defined here any more: it is server-only and lives in
-- 2026-11-10_server_only_writes.sql. (The original, browser-callable version let a user choose
-- their own limit.) Run that file to get it.

-- ---------------------------------------------------------------------------
-- product_events
-- ---------------------------------------------------------------------------
create table if not exists public.product_events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null check (name in (
               'entry_selected', 'interpret_done', 'clarify_shown',
               'recommend_done', 'choice_made', 'limit_hit')),
  props      jsonb       not null default '{}'::jsonb
               check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 512),
  created_at timestamptz not null default now()
);

create index if not exists product_events_user_time on public.product_events (user_id, created_at desc);
create index if not exists product_events_name_time on public.product_events (name, created_at desc);

alter table public.product_events enable row level security;

drop policy if exists "own product events" on public.product_events;
create policy "own product events" on public.product_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, delete on public.product_events to authenticated;

commit;
