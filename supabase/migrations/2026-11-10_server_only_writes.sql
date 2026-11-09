-- Migration: two things a signed-in browser must not be able to do any more. Safe to run more than once.
-- Run it AFTER 2026-11-09_abuse_guards_and_feedback.sql, and deploy the matching code in the same
-- window (see "Order" below). Back up first (Supabase dashboard -> Database -> Backups).
--
-- 1. consume_usage() becomes server-only.
--    Before: any signed-in user could call it straight from the browser with the anon key and
--    choose the limits themselves (`p_limit => 1000000`), or burn units to push the app-wide
--    counter toward its ceiling. Now: the function takes the user id as an argument, is NOT
--    executable by anon/authenticated, and only the server (service_role) can call it — with
--    limits taken from the server's own configuration and a user id from the verified session.
--
-- 2. The shared picture cache becomes server-write-only.
--    Before: any signed-in user could insert a recipe_images row and upload a file under any
--    well-formed key, pre-seeding the picture shown to everyone for that dish. Now: no insert
--    grant, no insert policy on the table, no insert policy on the bucket. The server (service_role,
--    which bypasses RLS) writes after validating type, size and path. Read stays as it was.
--
-- Order. The new code calls consume_usage(p_user, ...) as service_role and writes images as
-- service_role, so it needs SUPABASE_SERVICE_ROLE_KEY on the deployment (production REFUSES paid
-- calls without it). Run this migration, then deploy. Code deployed from BEFORE this change calls
-- the old three-argument function, which this migration drops: paid calls on that old deployment
-- are refused ("temporarily unavailable") until it is replaced. Nothing is stored wrongly.
--
-- Impact: no table is altered and no row is rewritten or removed.
begin;

-- ---------------------------------------------------------------------------
-- 1. consume_usage(p_user, kind, per-person limit, optional whole-app limit)
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

  -- This person's allowance: one atomic statement that adds one only while under the limit.
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

  -- The whole app's allowance, the same way. If the app is out, the unit just spent is given back.
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

-- Supabase's default privileges grant execute on new functions to anon and authenticated; take it back.
revoke all on function public.consume_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. recipe_images and its bucket: read-only for the browser
-- ---------------------------------------------------------------------------
drop policy if exists "recipe images can be added" on public.recipe_images;
revoke insert, update, delete on public.recipe_images from anon, authenticated;
grant select on public.recipe_images to authenticated;

drop policy if exists "signed-in users add recipe images" on storage.objects;

commit;

-- ---------------------------------------------------------------------------
-- Optional, after running: look for rows a user could have pre-seeded while writes were open.
--   select cache_key, title, model, created_at from public.recipe_images order by created_at desc;
-- A row you don't trust can be removed (the next request regenerates it):
--   delete from public.recipe_images where cache_key = '<key>';
--   -- and the file: Storage -> recipe-images -> delete '<key>.<ext>'.
-- ---------------------------------------------------------------------------
-- Rollback (restores the previous, weaker state — only if you must):
--   begin;
--   drop function if exists public.consume_usage(uuid, text, integer, integer);
--   -- then re-run 2026-11-09_abuse_guards_and_feedback.sql (it recreates the 3-argument function
--   -- and grants it to authenticated);
--   grant insert on public.recipe_images to authenticated;
--   create policy "recipe images can be added" on public.recipe_images for insert to authenticated with check (true);
--   create policy "signed-in users add recipe images" on storage.objects for insert to authenticated
--     with check (bucket_id = 'recipe-images' and name ~ '^[0-9a-f]{64}\.(webp|jpg|png)$');
--   commit;
