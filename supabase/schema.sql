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

-- Profile v2 — explicit nutrition personalization. All optional, all entered by
-- the user, never inferred from behavior. Idempotent ALTERs so re-running this
-- file upgrades an existing database; old rows stay valid (new columns are null
-- / empty).
--   * allergies: a SAFETY constraint, kept separate from dislikes (a preference).
--   * body inputs are stored in metric only; the form converts US units.
--   * sex is "sex used for the BMR equation" and nothing else.
--   * protein_target_g becomes nullable: null = "use the calculated suggestion".
--     Every existing value stays as a manual target. The daily calorie target
--     above already works the same way (null = no manual target).
--   * Calculated values (BMR, TDEE, suggestions) are never stored.
alter table public.profiles
  add column if not exists allergies      jsonb not null default '[]'::jsonb,
  add column if not exists sex            text     check (sex in ('male', 'female')),
  add column if not exists age_years      smallint check (age_years between 18 and 100),
  add column if not exists height_cm      numeric(4,1) check (height_cm between 100 and 250),
  add column if not exists weight_kg      numeric(4,1) check (weight_kg between 30 and 300),
  add column if not exists activity_level text
    check (activity_level in ('sedentary', 'lightly_active', 'moderately_active', 'very_active'));
alter table public.profiles alter column protein_target_g drop not null;
alter table public.profiles alter column protein_target_g drop default;

-- Health & nutrition priorities. Two SEPARATE jsonb arrays, both explicit and
-- user-entered, never inferred:
--   * health_conditions: optional context (high_blood_pressure,
--     prediabetes_or_diabetes, high_cholesterol). Never sent to the recommender;
--     a condition can only suggest a priority, which the user must confirm.
--   * nutrition_priorities: what the user confirmed they want to limit
--     (lower_sodium, limit_added_sugar, lower_saturated_fat). This is what the
--     recommender reads, as strong guidance (not a hard constraint).
-- Unsupported values are dropped by the app on read and save. Old rows get [].
alter table public.profiles
  add column if not exists health_conditions   jsonb not null default '[]'::jsonb,
  add column if not exists nutrition_priorities jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- pantry_items — LEGACY, UNUSED BY THIS CODE. No app code in this branch
-- reads or writes this table; kitchen_staples (below) replaces it — see
-- CLAUDE.md's "Kitchen staples vs. today's food". It used to be a single,
-- persisted "what food do you generally have" list, which is exactly the
-- staleness bug kitchen_staples fixes: a name typed in weeks ago (a real,
-- perishable "Chicken") was being auto-assumed available forever.
--
-- Deliberately left fully alone here — table, RLS policy, and grants
-- unchanged — because another deployment on this same Supabase database may
-- still depend on it (see the "Help me shop" feature on a sibling branch).
-- Revoking access now would break that deployment before it's promoted onto
-- this model. Retire it for real in a separate cleanup migration once this
-- branch is merged and nothing else reads pantry_items any more.
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
-- kitchen_staples — persistent condiments/seasonings only (see CLAUDE.md,
-- "Kitchen staples vs. today's food"). Never actual food: no chicken, tofu,
-- eggs, produce, grains. Today's "what do you have right now" is the only
-- other ingredient source for a recommendation, and it is per-request, never
-- persisted here or anywhere else — see decision_sessions.context instead.
-- ---------------------------------------------------------------------------
create table if not exists public.kitchen_staples (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);
create index if not exists kitchen_staples_user_idx on public.kitchen_staples (user_id);

-- One-time, idempotent, conservative backfill from the legacy pantry_items:
-- copy a row only when its name is an EXACT (case/whitespace-insensitive)
-- match for an unambiguous condiment/seasoning. Deliberately a short,
-- literal allowlist, not a keyword/substring match — "onion powder" is safe,
-- "onion" is not, and a substring rule would conflate them. Anything not on
-- this list (garlic, ginger, onion, eggs, tofu, cheese, yogurt, milk, bread,
-- rice, oats, fruit, vegetables, meat, ...) is left out on purpose: losing an
-- old entry here is fine, misclassifying a perishable as a permanent staple
-- is the bug this migration exists to avoid. Users can re-add anything
-- missing on Me → Kitchen staples. Guarded by `not exists` so re-pasting this
-- file never creates duplicates or re-adds something the user removed.
insert into public.kitchen_staples (user_id, name)
select distinct p.user_id, p.name
from public.pantry_items p
where lower(trim(p.name)) in (
  'salt', 'black pepper',
  'olive oil', 'cooking oil', 'sesame oil', 'chili oil',
  'soy sauce', 'vinegar', 'hot sauce', 'mustard', 'mayo',
  'paprika', 'cumin', 'curry powder', 'garlic powder', 'onion powder',
  'sugar', 'honey'
)
and not exists (
  select 1 from public.kitchen_staples k
  where k.user_id = p.user_id and lower(trim(k.name)) = lower(trim(p.name))
);

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.pantry_items      enable row level security;
alter table public.kitchen_staples   enable row level security;
alter table public.recipes           enable row level security;
alter table public.decision_sessions enable row level security;
alter table public.meal_feedback     enable row level security;
alter table public.place_feedback    enable row level security;
alter table public.saved_recipes     enable row level security;
alter table public.saved_places      enable row level security;

-- profiles is keyed on id (which IS the auth user id), the rest on user_id.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- pantry_items keeps its existing "own pantry" policy untouched (see above) —
-- not recreated here, since this file only ever adds; a database that never
-- ran the original schema simply has no policy for it, which is fine given
-- nothing here reads or writes it either.

drop policy if exists "own kitchen staples" on public.kitchen_staples;
create policy "own kitchen staples" on public.kitchen_staples
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

drop policy if exists "own place feedback" on public.place_feedback;
create policy "own place feedback" on public.place_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved recipes" on public.saved_recipes;
create policy "own saved recipes" on public.saved_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved places" on public.saved_places;
create policy "own saved places" on public.saved_places
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

-- pantry_items keeps its existing grant untouched, same reasoning as its RLS
-- policy above — see the table comment for why it isn't revoked yet.

grant select, insert, update, delete on public.profiles          to authenticated;
grant select, insert, update, delete on public.kitchen_staples   to authenticated;
grant select, insert, update, delete on public.recipes           to authenticated;
grant select, insert, update, delete on public.decision_sessions to authenticated;
grant select, insert, update, delete on public.meal_feedback     to authenticated;
grant select, insert, update, delete on public.place_feedback    to authenticated;
grant select, insert, update, delete on public.saved_recipes     to authenticated;
grant select, insert, update, delete on public.saved_places      to authenticated;

-- ---------------------------------------------------------------------------
-- recipe_images — shared cache of generated recipe pictures (see
-- supabase/migrations/2026-10-02_recipe_images.sql for the design and the
-- trade-off). Not user data: no user_id, not in accountData.ts.
-- ---------------------------------------------------------------------------

create table if not exists public.recipe_images (
  cache_key      text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  storage_path   text        not null check (storage_path like cache_key || '.%'),
  model          text        not null,
  prompt_version smallint    not null,
  title          text        not null,
  created_at     timestamptz not null default now()
);

alter table public.recipe_images enable row level security;

drop policy if exists "recipe images are readable" on public.recipe_images;
create policy "recipe images are readable" on public.recipe_images
  for select to authenticated using (true);

-- Writes are server-only (service_role bypasses RLS): no insert policy, no insert grant.
-- See supabase/migrations/2026-11-10_server_only_writes.sql for why.
drop policy if exists "recipe images can be added" on public.recipe_images;
revoke insert, update, delete on public.recipe_images from anon, authenticated;
grant select on public.recipe_images to authenticated;

-- The bucket. Public read; no update, no delete for anyone but the owner role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "recipe images are public" on storage.objects;
create policy "recipe images are public" on storage.objects
  for select using (bucket_id = 'recipe-images');

-- No insert policy for signed-in users: the server uploads with the service role, after validating type, size and path.
drop policy if exists "signed-in users add recipe images" on storage.objects;

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

-- ===========================================================================
-- Web beta: per-user daily usage limits + first-party product events.
-- (Also supabase/migrations/2026-11-07_usage_and_events.sql, for a database that
-- already has everything above.) See that file for why the tables are shaped
-- this way.
-- ===========================================================================

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

-- consume_usage() is defined in the "Public beta" block at the end of this file
-- (it replaced the original two-argument version).

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

-- ===========================================================================
-- Account deletion must not be blocked by shared files the user happened to
-- upload (a generated recipe picture). Also supabase/migrations/2026-11-08_*;
-- see that file for the why.
-- ===========================================================================

create or replace function public.release_user_storage(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_released integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  update storage.objects set owner = null where owner = p_user;
  get diagnostics v_released = row_count;

  -- Newer Storage versions also keep the owner as text; older ones don't have the column.
  begin
    update storage.objects set owner_id = null where owner_id = p_user::text;
  exception when undefined_column then
    null;
  end;

  return v_released;
end;
$$;

revoke all on function public.release_user_storage(uuid) from public, anon, authenticated;
grant execute on function public.release_user_storage(uuid) to service_role;

-- ===========================================================================
-- Public beta: whole-app daily ceiling, owner's off switch, feedback form.
-- (Also supabase/migrations/2026-11-09_abuse_guards_and_feedback.sql; see it for the why.)
-- ===========================================================================

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
-- consume_usage(user, kind, per-person limit, optional whole-app limit) — server-only
--   allowed     — true: one unit was spent and the paid call may start
--   used        — the person's count today (after this call if it was allowed)
--   refused_by  — null when allowed; otherwise 'user' (their own limit), 'global'
--                 (the app's daily ceiling), 'paused' (switched off in app_flags) or
--                 'invalid' (no user / nonsense arguments)
-- ---------------------------------------------------------------------------
drop function if exists public.consume_usage(text, integer);
drop function if exists public.consume_usage(text, integer, integer);

create or replace function public.consume_usage(p_user uuid, p_kind text, p_limit integer, p_global_limit integer default null)
returns table (allowed boolean, used integer, refused_by text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := p_user;
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

-- SERVER-ONLY: a browser could otherwise pass its own limits. Only service_role may call it.
revoke all on function public.consume_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, integer, integer) to service_role;

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
