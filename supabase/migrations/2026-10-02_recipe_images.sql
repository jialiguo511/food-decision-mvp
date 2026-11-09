-- Migration: generated recipe images — a shared "generate once, reuse" cache.
-- Safe to run more than once. Touches only the new table, the new storage bucket
-- and their policies; nothing existing is altered.
--
-- What it adds:
--   * public.recipe_images — one row per generated image, keyed by a sha256 of
--     the recipe's identity (title + main ingredients + cooking method; see
--     src/lib/images/recipeKey.ts). Metadata only: which file, which model.
--   * storage bucket `recipe-images` — the image files, public-read (they are
--     generic dish pictures, not personal data), named <cache_key>.webp.
--
-- Deliberately NOT user data: a dish picture belongs to no one, so there is no
-- user_id and the table is not in accountData.ts's USER_TABLES. Reset / Delete
-- account leave it alone; it contains no trace of who asked for an image.
--
-- HISTORY (superseded by 2026-11-10_server_only_writes.sql, which this file now agrees with):
-- the first version let writes use the signed-in user's own credentials (the
-- service-role key stays reserved for account deletion), so any signed-in user
-- could add an image under a key. The checks below limit what can be written —
-- the key must be a sha256 hex string, the file name must match it, no
-- updates or deletes, 1 MB cap, image types only — but they cannot stop someone
-- who computes the key of a particular dish from pre-uploading a different
-- picture for it. If that ever matters, move the write behind the service role.

begin;

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

-- Writes are server-only (see 2026-11-10_server_only_writes.sql): this file originally let any
-- signed-in user insert; it now leaves the table read-only for the browser, so running it again
-- can never re-open that.
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

-- No insert policy for signed-in users any more (the server uploads with the service role).
drop policy if exists "signed-in users add recipe images" on storage.objects;

commit;

notify pgrst, 'reload schema';
