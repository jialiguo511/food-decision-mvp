"use server";

// Account & data. Two different operations on purpose:
//   resetMyData   — wipe everything the user owns, keep the login. Afterwards the
//                   account is indistinguishable from a brand-new sign-up.
//   deleteAccount — wipe everything AND remove the auth user, then sign out.
// Both act only on the id of the VERIFIED session (auth.getUser() validates the
// token with Supabase) — never on an id sent from the browser.

import { revalidatePath } from "next/cache";
import { wipeUserData } from "@/lib/accountData";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AccountResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = { ok: false, error: "You are signed out. Please sign in again." } as const;

/**
 * Removes every row in every user-owned table (see lib/accountData.ts) through
 * the user's own client — RLS applies, and no admin key is involved. Each table
 * is re-read afterwards, so "reset" means the rows are really gone. Safe to run
 * again after a failure.
 */
export async function resetMyData(): Promise<AccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGNED_OUT;

  const wiped = await wipeUserData(supabase, user.id);
  if (!wiped.ok) {
    console.error("[account] reset failed", { failedAt: wiped.failedAt });
    return { ok: false, error: "Couldn't finish resetting. Please try again." };
  }
  console.info("[account] reset", { cleared: wiped.cleared.length, skipped: wiped.skipped });

  // Whatever the server cached for this user's pages is now wrong.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Permanently deletes the account. Order matters for partial failure:
 *   1. the admin key must exist (otherwise refuse before touching anything);
 *   2. all app data is removed and verified (a failure here leaves the login
 *      intact, so the user can retry);
 *   3. only then the auth user is deleted — Supabase Auth deletion needs the
 *      service-role key, so it happens here on the server and nowhere else;
 *   4. the session cookie is cleared.
 * If (3) fails after (2), the account is left empty-but-valid — a reset state —
 * and retrying completes it.
 */
export async function deleteAccount(): Promise<AccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGNED_OUT;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[account] delete refused: SUPABASE_SERVICE_ROLE_KEY isn't set, so the auth user can't be removed.");
    return { ok: false, error: "Deleting an account isn't set up on this server yet." };
  }

  // Explicit, not reliant on ON DELETE CASCADE: a database that drifted from
  // schema.sql would otherwise keep orphaned data.
  const wiped = await wipeUserData(admin, user.id);
  if (!wiped.ok) {
    console.error("[account] delete: data wipe failed; auth user kept", { failedAt: wiped.failedAt });
    return { ok: false, error: "Couldn't delete everything. Your account is still active — please try again." };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete: auth user removal failed (data already cleared)", { message: error.message });
    return { ok: false, error: "Your data was cleared, but the account couldn't be removed. Please try again." };
  }

  // The cookie now names a user that no longer exists; clear it. The user is
  // already gone, so a failure here is harmless.
  await supabase.auth.signOut().catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}
