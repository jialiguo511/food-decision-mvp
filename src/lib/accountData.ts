// What "a user's data" is — ONE definition, used by both "Reset my data" and
// "Delete my account", so the two can't drift apart.
//
// A brand-new account is exactly: an auth user and ZERO rows in every table
// below (no profile row at all — the app treats a missing row as the normal
// first-run state, and `profileStage` of it is "new"). So reset doesn't
// "restore defaults" field by field; it removes every row, which is by
// construction the same state a new sign-up has. Anything not in this list is
// either the auth identity itself (kept by reset, removed by delete) or
// in-memory/client state that dies with a full page load: the app keeps nothing
// in localStorage/sessionStorage/IndexedDB (the recommendation store is module
// memory), and the Supabase auth cookie is the login.
//
// supabase/schema.sql also guarantees `on delete cascade` from auth.users on
// every table here — but delete does NOT rely on that (a database that drifted
// from the file would silently keep data): rows are removed explicitly first,
// and src/lib/accountData.test.ts fails if a user-owned table appears in the SQL
// without being listed here.

import type { SupabaseClient } from "@supabase/supabase-js";

export type UserTable = {
  table: string;
  /** The column holding the owner's auth user id. */
  column: "user_id" | "id";
  /** Legacy table the current code never reads (pantry_items, recipes). Cleared
   *  when it can be, but a permissions refusal on it doesn't fail the whole
   *  operation — it can't affect how the app behaves. */
  legacy?: true;
};

/** Children before parents; `profiles` last. */
export const USER_TABLES: readonly UserTable[] = [
  { table: "meal_feedback", column: "user_id" }, // "did you eat it" — also cascades from decision_sessions
  { table: "place_feedback", column: "user_id" }, // "not for me" on places
  { table: "saved_recipes", column: "user_id" }, // Saved
  { table: "saved_places", column: "user_id" }, // Saved
  { table: "decision_sessions", column: "user_id" }, // every request: its context, the 3 cards, the pick — also what "Last time" is read from
  { table: "kitchen_staples", column: "user_id" },
  { table: "recipes", column: "user_id", legacy: true }, // old Recipe Inbox
  { table: "pantry_items", column: "user_id", legacy: true }, // old pantry, replaced by kitchen_staples
  { table: "profiles", column: "id" }, // Food Profile + prefs JSON (setup/nutrition flags, provenance, dietary)
];

type DbError = { code?: string; message?: string } | null;

/** A table that doesn't exist in this database (its migration was never run):
 *  there is nothing in it to clear. */
export const isMissingTable = (error: DbError) => error?.code === "PGRST205" || error?.code === "42P01";

export type WipeResult =
  | { ok: true; cleared: string[]; skipped: string[] }
  | { ok: false; failedAt: string; error: string };

/**
 * Removes every row the user owns, then re-reads each table to prove it: a
 * delete that RLS silently turned into a no-op returns no error, so "no error"
 * is not trusted. Stops at the first real failure (the caller reports it and the
 * user can simply run it again — every step is idempotent).
 *
 * `client` is either the signed-in user's client (RLS scopes it) or the admin
 * client; either way the filter names the user explicitly.
 */
export async function wipeUserData(client: SupabaseClient, userId: string): Promise<WipeResult> {
  const cleared: string[] = [];
  const skipped: string[] = [];

  for (const { table, column, legacy } of USER_TABLES) {
    const del = await client.from(table).delete().eq(column, userId);
    if (del.error) {
      if (isMissingTable(del.error) || (legacy && del.error.code === "42501")) {
        skipped.push(table);
        continue;
      }
      console.error("[account] couldn't clear", table, { code: del.error.code, message: del.error.message });
      return { ok: false, failedAt: table, error: "Couldn't clear some of your data." };
    }

    const left = await client.from(table).select(column).eq(column, userId).limit(1);
    if (left.error && !isMissingTable(left.error)) {
      console.error("[account] couldn't verify", table, { code: left.error.code, message: left.error.message });
      if (legacy) {
        skipped.push(table);
        continue;
      }
      return { ok: false, failedAt: table, error: "Couldn't confirm your data was cleared." };
    }
    if ((left.data?.length ?? 0) > 0) {
      console.error("[account] rows remain after delete", table);
      if (legacy) {
        skipped.push(table);
        continue;
      }
      return { ok: false, failedAt: table, error: "Some of your data couldn't be cleared." };
    }
    cleared.push(table);
  }
  return { ok: true, cleared, skipped };
}
