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
--   3. consume_usage()    — replaced by a version that also checks (1) and (2). The new third
--                           argument is optional, so the code that is already deployed keeps
--                           working. The old two-argument version is dropped first (two
--                           overloads would make PostgREST's call ambiguous).
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

-- ---------------------------------------------------------------------------
-- consume_usage(kind, per-person limit, optional whole-app limit)
--   allowed     — true: one unit was spent and the paid call may start
--   used        — the person's count today (after this call if it was allowed)
--   refused_by  — null when allowed; otherwise 'user' (their own limit), 'global'
--                 (the app's daily ceiling), 'paused' (switched off in app_flags) or
--                 'invalid' (signed out / nonsense arguments)
-- ---------------------------------------------------------------------------
drop function if exists public.consume_usage(text, integer);

create or replace function public.consume_usage(p_kind text, p_limit integer, p_global_limit integer default null)
returns table (allowed boolean, used integer, refused_by text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_day    date := (now() at time zone 'utc')::date;
  v_count  integer;
  v_global integer;
  v_paused text;
begin
  if v_user is null or p_limit is null or p_limit < 1 or p_kind is null or p_kind !~ '^[a-z_]{1,32}$'
     or (p_global_limit is not null and p_global_limit < 1) then
    return query select false, 0, 'invalid'::text;
    return;
  end if;

  -- The owner's off switch.
  select f.value into v_paused from public.app_flags f where f.key = 'paused_kinds';
  if v_paused is not null and v_paused <> '' then
    if lower(trim(v_paused)) = 'all' or p_kind = any (string_to_array(regexp_replace(lower(v_paused), '\s', '', 'g'), ',')) then
      return query select false, 0, 'paused'::text;
      return;
    end if;
  end if;

  -- Keep both tables small: rows older than a week are of no use.
  delete from public.usage_counters c where c.user_id = v_user and c.day < v_day - 7;
  delete from public.global_usage g where g.day < v_day - 7;

  -- This person's allowance: one atomic statement that adds one only while under
  -- the limit. At the limit nothing is updated and nothing is returned.
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
    return query select false, coalesce(v_count, 0), 'user'::text;
    return;
  end if;

  -- The whole app's allowance, the same way. A person already over their own limit
  -- returned above, so they never touch (or contend on) this row. If the app is out,
  -- the unit just spent is given back: the paid call will not happen.
  if p_global_limit is not null then
    insert into public.global_usage as g (day, kind, count)
    values (v_day, p_kind, 1)
    on conflict (day, kind)
    do update set count = g.count + 1
    where g.count < p_global_limit
    returning g.count into v_global;

    if v_global is null then
      update public.usage_counters u set count = u.count - 1
      where u.user_id = v_user and u.day = v_day and u.kind = p_kind and u.count > 0;
      return query select false, greatest(v_count - 1, 0), 'global'::text;
      return;
    end if;
  end if;

  return query select true, v_count, null::text;
end;
$$;

revoke all on function public.consume_usage(text, integer, integer) from public, anon;
grant execute on function public.consume_usage(text, integer, integer) to authenticated;

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
--   drop function if exists public.consume_usage(text, integer, integer);
--   -- then re-run the consume_usage() definition from 2026-11-07_usage_and_events.sql
--   drop table if exists public.feedback, public.global_usage, public.app_flags;
