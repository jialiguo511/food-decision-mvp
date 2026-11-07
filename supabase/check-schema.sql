-- READ-ONLY check: which pieces of the schema this release needs are present in
-- THIS database. Paste into the Supabase SQL editor and run. It changes nothing
-- (one SELECT). Every row says `ok` or `MISSING`; anything MISSING is what the
-- next step has to add.
--
--   * Brand-new, empty project  → run supabase/schema.sql once.
--   * Existing project          → run this first. If every row is `ok`, there is
--     nothing to migrate. Otherwise run supabase/schema.sql (it is idempotent:
--     every statement is "if not exists" / "or replace" / "drop … if exists",
--     and it only adds what is missing), or just the one migration named in
--     RELEASE.md for the rows that are MISSING.
--
-- It checks that things EXIST, not that an existing table has exactly the right
-- constraints — running schema.sql is what brings those up to date.

with
tables(name) as (values
  ('profiles'), ('kitchen_staples'), ('decision_sessions'), ('meal_feedback'),
  ('place_feedback'), ('saved_recipes'), ('saved_places'), ('recipe_images'),
  ('usage_counters'), ('product_events')),
profile_columns(name) as (values
  ('daily_calorie_target_kcal'), ('allergies'), ('sex'), ('age_years'), ('height_cm'),
  ('weight_kg'), ('activity_level'), ('health_conditions'), ('nutrition_priorities')),
rls_tables(name) as (values
  ('profiles'), ('kitchen_staples'), ('decision_sessions'), ('meal_feedback'),
  ('place_feedback'), ('saved_recipes'), ('saved_places'), ('usage_counters'), ('product_events'))
select 'table ' || t.name as item,
       case when exists (select 1 from pg_tables p where p.schemaname = 'public' and p.tablename = t.name) then 'ok' else 'MISSING' end as status
from tables t
union all
select 'column profiles.' || c.name,
       case when exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = 'profiles' and i.column_name = c.name) then 'ok' else 'MISSING' end
from profile_columns c
union all
select 'row level security on ' || r.name,
       case when exists (select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace where n.nspname = 'public' and k.relname = r.name and k.relrowsecurity)
            or not exists (select 1 from pg_tables p where p.schemaname = 'public' and p.tablename = r.name)
            then 'ok' else 'MISSING' end
from rls_tables r
union all
select 'function consume_usage',
       case when exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace where n.nspname = 'public' and f.proname = 'consume_usage') then 'ok' else 'MISSING' end
union all
select 'storage bucket recipe-images',
       case when to_regclass('storage.buckets') is not null and exists (select 1 from storage.buckets b where b.id = 'recipe-images') then 'ok' else 'MISSING' end
order by 1;
