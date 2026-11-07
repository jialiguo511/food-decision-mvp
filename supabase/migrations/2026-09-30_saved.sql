-- Migration: Saved (recipes + places). Safe to run on the current production
-- schema, and safe to run more than once: every statement is IF NOT EXISTS /
-- DROP ... IF EXISTS / re-grant, and it touches only the two objects below.
-- It creates nothing else, alters no existing table, and needs no other
-- migration first (only auth.users, which Supabase always has).
-- Paste into the Supabase SQL editor and run once.

begin;

-- ---------------------------------------------------------------------------
-- saved_recipes / saved_places — "Saved": things the user wants to come back
-- to. Explicit interest only — not picked, not ate, not loved, and not (yet)
-- read by any ranking. created_at is the saved-at time. Two tables because the
-- identities differ; neither is the legacy `recipes` Recipe Inbox table, which
-- holds raw captured text, not generated recommendations.
--   saved_recipes: `recipe` is the canonical Cook recommendation, verbatim.
--     recipe_key is a sha256 of its title + ingredients + steps (app code,
--     lib/saved/saved.ts), so saving the same recipe twice is one row.
--   saved_places: keyed by the provider's place id (never the name).
-- ---------------------------------------------------------------------------
create table if not exists public.saved_recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  recipe_key  text        not null,
  recipe      jsonb       not null,
  created_at  timestamptz not null default now(),
  unique (user_id, recipe_key)
);
create index if not exists saved_recipes_user_idx on public.saved_recipes (user_id, created_at desc);

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
  look_for    text,       -- the "what to look for" guidance as saved; guidance, not a menu item
  created_at  timestamptz not null default now(),
  unique (user_id, provider, place_id)
);
create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);

alter table public.saved_recipes enable row level security;
alter table public.saved_places  enable row level security;

drop policy if exists "own saved recipes" on public.saved_recipes;
create policy "own saved recipes" on public.saved_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved places" on public.saved_places;
create policy "own saved places" on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RLS and GRANTs are separate gates: without the grant, authenticated users get
-- "42501 permission denied" before any policy runs. `anon` is deliberately not
-- granted anything.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
grant select, insert, update, delete on public.saved_places  to authenticated;

commit;
