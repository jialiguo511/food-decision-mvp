-- Migration: per-user daily usage limits + first-party product events (web beta).
-- Safe to run more than once. Touches only the two new tables and one new
-- function; nothing existing is altered. Run it BEFORE deploying the code that
-- calls it (in production the app refuses paid requests without it — see
-- src/lib/usage/consume.ts).
--
-- usage_counters — one row per (user, UTC day, kind of paid call). The ONLY way
-- to change it is public.consume_usage(), a SECURITY DEFINER function that takes
-- the user from auth.uid() and can only add one: the table has RLS on, no
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

create or replace function public.consume_usage(p_kind text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_user is null or p_limit is null or p_limit < 1 or p_kind is null or p_kind !~ '^[a-z_]{1,32}$' then
    return query select false, 0;
    return;
  end if;

  -- Keep the table small: this user's rows older than a week are of no use.
  delete from public.usage_counters c where c.user_id = v_user and c.day < v_day - 7;

  -- One atomic statement: add one only while under the limit. When the row is
  -- already at the limit the WHERE is false, nothing is updated, and nothing is
  -- returned — that is the "refused" case.
  insert into public.usage_counters as u (user_id, day, kind, count)
  values (v_user, v_day, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    select u.count into v_count
    from public.usage_counters u
    where u.user_id = v_user and u.day = v_day and u.kind = p_kind;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  return query select true, v_count;
end;
$$;

revoke all on function public.consume_usage(text, integer) from public, anon;
grant execute on function public.consume_usage(text, integer) to authenticated;

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
