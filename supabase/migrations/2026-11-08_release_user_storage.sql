-- Migration: let "Delete my account" succeed for people who caused a picture to be
-- generated. Safe to run more than once; adds one function, changes nothing else.
--
-- The problem: Supabase will not delete an auth user who still OWNS Storage
-- objects (storage.objects.owner references auth.users with no cascade —
-- https://supabase.com/docs/guides/auth/managing-user-data). A generated recipe
-- picture is uploaded with the signed-in user's own credentials, so the person who
-- happened to trigger a generation ends up owning that file, and their account
-- could no longer be deleted ("Database error deleting user"). The picture is a
-- SHARED cache of a dish, not their data — so on deletion the file is kept and
-- simply released: its owner is set to null.
--
-- Only the server's service-role key can call this (it is used for account
-- deletion and nothing else — see src/app/profile/account.actions.ts). No signed-in
-- user, and nobody anonymous, can execute it.

begin;

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

commit;
