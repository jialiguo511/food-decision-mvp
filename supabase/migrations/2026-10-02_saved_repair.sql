-- Migration: Saved — repair. OPTIONAL and idempotent. Run it if Save fails and
-- the diagnostic (open /api/dev/saved-check while signed in, in development)
-- reports PGRST205 / PGRST204 / 42P10 / 42501 on saved_recipes or saved_places.
-- On a database whose Saved tables are already right it changes nothing.
--
-- Why it exists: 2026-09-30_saved.sql creates the tables with
-- `create table if not exists`, which does nothing when a table of that name is
-- already there in an older shape. The app's saves are
--   INSERT … ON CONFLICT (user_id, recipe_key) DO NOTHING          (recipes)
--   INSERT … ON CONFLICT (user_id, provider, place_id) DO NOTHING  (places)
-- and those fail outright if the columns or the unique index are missing, if RLS
-- or the grant is absent, or if PostgREST's schema cache hasn't seen the tables
-- yet. This file states each of those explicitly, then reloads the cache.
--
-- Touches only saved_recipes and saved_places. Deletes nothing.

begin;

create table if not exists public.saved_recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  recipe_key  text        not null,
  recipe      jsonb       not null,
  created_at  timestamptz not null default now()
);
create table if not exists public.saved_places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  provider    text        not null default 'google_places',
  place_id    text        not null,
  name        text        not null,
  address     text,
  category    text,
  maps_url    text,
  website_url text,
  look_for    text,
  created_at  timestamptz not null default now()
);

-- Columns an older shape may lack (nullable on purpose: existing rows can't be
-- given a value, and the app always writes all of them).
alter table public.saved_recipes
  add column if not exists recipe_key text,
  add column if not exists recipe     jsonb,
  add column if not exists created_at timestamptz not null default now();
alter table public.saved_places
  add column if not exists provider    text not null default 'google_places',
  add column if not exists place_id    text,
  add column if not exists name        text,
  add column if not exists address     text,
  add column if not exists category    text,
  add column if not exists maps_url    text,
  add column if not exists website_url text,
  add column if not exists look_for    text,
  add column if not exists created_at  timestamptz not null default now();

-- The conflict targets. A unique INDEX satisfies ON CONFLICT inference exactly
-- as the table constraint in the original migration does.
create unique index if not exists saved_recipes_user_recipe_key_uidx on public.saved_recipes (user_id, recipe_key);
create unique index if not exists saved_places_user_provider_place_uidx on public.saved_places (user_id, provider, place_id);
create index if not exists saved_recipes_user_idx on public.saved_recipes (user_id, created_at desc);
create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);

alter table public.saved_recipes enable row level security;
alter table public.saved_places  enable row level security;

drop policy if exists "own saved recipes" on public.saved_recipes;
create policy "own saved recipes" on public.saved_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved places" on public.saved_places;
create policy "own saved places" on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
grant select, insert, update, delete on public.saved_places  to authenticated;

commit;

-- Make PostgREST (the Supabase API) re-read the schema now rather than on its
-- next refresh — a table created a moment ago is otherwise "not in the schema
-- cache" (PGRST205) for the API even though SQL can see it.
notify pgrst, 'reload schema';
