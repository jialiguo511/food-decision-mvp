-- Food Decision MVP — database schema
-- Paste this whole file into the Supabase SQL editor and run it.
-- It is safe to re-run: everything is created "if not exists".
--
-- Design notes:
--   * We do not create a users table. Supabase Auth owns auth.users.
--   * Every table has user_id and Row Level Security. RLS is the
--     authorization layer — app code never filters by user by hand.
--   * Flexible preference lists are JSONB arrays, not join tables.
--     They are always read and written as a whole.

-- ---------------------------------------------------------------------------
-- profiles — persistent preferences (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text,
  goal                  text        not null default 'general_health',
  protein_target_g      integer     not null default 120,
  budget_per_meal_usd   numeric(6,2) not null default 12,
  fridge_size           text        not null default 'standard',
  default_cook_minutes  integer     not null default 30,
  cuisines              jsonb       not null default '[]'::jsonb,
  dislikes              jsonb       not null default '[]'::jsonb,
  equipment             jsonb       not null default '[]'::jsonb,
  -- catch-all for preferences we add later without a migration
  prefs                 jsonb       not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Optional, entered by the user. Null means "no target". Added as ALTER so that
-- re-running this file upgrades a database created before the column existed.
alter table public.profiles
  add column if not exists daily_calorie_target_kcal integer
  check (daily_calorie_target_kcal between 1000 and 5000);

-- ---------------------------------------------------------------------------
-- pantry_items — what's in the kitchen. Names only, no quantities, no expiry.
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  category   text        not null default 'other',  -- protein | veg | carb | dairy | sauce | other
  created_at timestamptz not null default now()
);
create index if not exists pantry_items_user_idx on public.pantry_items (user_id);

-- ---------------------------------------------------------------------------
-- recipes — the Recipe Inbox. Raw capture first, structure later.
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text,
  source_type text        not null default 'manual', -- manual | pasted_text | url
  source_url  text,
  raw_text    text,
  -- LLM-extracted fields: ingredients, steps, time, equipment, nutrition estimates
  structured  jsonb       not null default '{}'::jsonb,
  status      text        not null default 'inbox',  -- inbox | structured | archived
  is_favorite boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- decision_sessions — one "Find my meal" event
-- ---------------------------------------------------------------------------
create table if not exists public.decision_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  -- the dynamic context the user entered (time, hunger, effort, craving, ...)
  context         jsonb       not null default '{}'::jsonb,
  -- the exact 3 recommendations returned, stored verbatim
  recommendations jsonb       not null default '[]'::jsonb,
  chosen_index    integer,    -- 0, 1, 2, or null if they picked nothing
  created_at      timestamptz not null default now()
);
create index if not exists decision_sessions_user_idx
  on public.decision_sessions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- meal_feedback — did they actually eat it? This is the signal that matters.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  session_id  uuid        references public.decision_sessions (id) on delete cascade,
  meal_title  text,
  did_eat     boolean,
  rating      integer,    -- 1..5, optional
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists meal_feedback_user_idx
  on public.meal_feedback (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.pantry_items      enable row level security;
alter table public.recipes           enable row level security;
alter table public.decision_sessions enable row level security;
alter table public.meal_feedback     enable row level security;

-- profiles is keyed on id (which IS the auth user id), the rest on user_id.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own pantry" on public.pantry_items;
create policy "own pantry" on public.pantry_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sessions" on public.decision_sessions;
create policy "own sessions" on public.decision_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own feedback" on public.meal_feedback;
create policy "own feedback" on public.meal_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- RLS and GRANTs are two separate gates in Postgres, and both must pass.
-- A policy decides *which rows* a role may touch; a GRANT decides whether the
-- role may touch the table at all. Enabling RLS without granting privileges
-- fails with "42501 permission denied for table ..." before any policy runs.
--
-- Newer Supabase projects ship no blanket privileges on the public schema, so
-- we state them here rather than relying on the project's defaults.
--
-- We grant to `authenticated` only. Every page in this app calls requireUser(),
-- so nothing is ever read or written as `anon`. Leaving `anon` without
-- privileges means a signed-out request is rejected by Postgres itself.
--
-- This is safe precisely because RLS is on: `authenticated` is every logged-in
-- user, and the policies above still restrict each one to their own rows.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles          to authenticated;
grant select, insert, update, delete on public.pantry_items      to authenticated;
grant select, insert, update, delete on public.recipes           to authenticated;
grant select, insert, update, delete on public.decision_sessions to authenticated;
grant select, insert, update, delete on public.meal_feedback     to authenticated;

-- ---------------------------------------------------------------------------
-- keep profiles.updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
