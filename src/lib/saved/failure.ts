// What a failed Saved query leaves behind. Saving crosses five layers — the
// click, the server action, the signed-in user, the SQL (RLS, grants,
// constraints), and the read back — and "Couldn't save that" told us none of
// them. Every failure is now logged ONCE, on the server, with the operation,
// the item type, the Postgres / PostgREST error code and a plain-language
// reading of what that code usually means here; in development the same
// diagnosis is returned to the browser too. In production the person only ever
// sees the simple copy — never a table name, a code or a message.
//
// Pure apart from console.error.

export type SavedItemType = "recipe" | "place" | "session";

export type DbErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null };

export type SavedFailure = {
  /** e.g. "save recipe", "unsave place", "read session". */
  operation: string;
  item_type: SavedItemType;
  code: string | null;
  message: string;
  /** What this code usually means for Saved, and what to do. */
  likely_cause: string;
};

/** The usual reading of a database error code, for whoever is debugging. */
export function likelyCause(code: string | undefined | null, message = ""): string {
  switch (code) {
    case "PGRST205":
    case "42P01":
      return "The Saved tables don't exist in this database — run supabase/migrations/2026-09-30_saved.sql (and 2026-09-30_place_feedback.sql) in the Supabase SQL editor.";
    case "PGRST204":
    case "42703":
      return "A column the app writes isn't in this table — the table is older than the code. Run supabase/migrations/2026-10-02_saved_repair.sql (it also reloads the API schema cache).";
    case "42501":
      return "Permission denied: a missing GRANT for the `authenticated` role, or an RLS policy refusing the row. Re-run the migration (it states both).";
    case "42P10":
      return "The table exists but has no unique constraint on the columns the save conflicts on ((user_id, recipe_key) / (user_id, provider, place_id)) — an older shape of the table. Run supabase/migrations/2026-10-02_saved_repair.sql.";
    case "23503":
      return "Foreign key violation: the signed-in user's id isn't in auth.users of THIS database (a different Supabase project than the one that issued the login, or a deleted account).";
    case "23502":
      return "A required column was null — the payload is missing a field.";
    case "23505":
      return "Unique violation — a duplicate that the upsert should have ignored.";
    case "22P02":
      return "Invalid input syntax — an id that isn't a valid uuid was sent.";
    case "PGRST301":
    case "PGRST303":
      return "The login token was rejected (expired or from another project) — sign out and in again.";
    default:
      return /jwt/i.test(message) ? "The login token was rejected — sign out and in again." : "Unrecognised database error — see the code and message.";
  }
}

/** Logs one failure and returns the structured record. `userId` is shortened:
 *  enough to correlate, not a full identifier. */
export function logSavedFailure(
  operation: string,
  item_type: SavedItemType,
  error: DbErrorLike | string,
  context: { userId?: string; sessionId?: string; index?: number } = {},
): SavedFailure {
  const e: DbErrorLike = typeof error === "string" ? { message: error } : error;
  const failure: SavedFailure = {
    operation,
    item_type,
    code: e.code ?? null,
    message: e.message ?? "unknown error",
    likely_cause: likelyCause(e.code, e.message),
  };
  console.error(`[saved] ${operation} failed`, {
    ...failure,
    details: e.details ?? null,
    hint: e.hint ?? null,
    user: context.userId ? `${context.userId.slice(0, 8)}…` : null,
    session: context.sessionId ?? null,
    index: context.index ?? null,
  });
  return failure;
}

/** One line for the dev-only diagnostic shown next to the button. */
export function diagnosticLine(f: SavedFailure): string {
  return `${f.operation} · ${f.item_type} · ${f.code ?? "no code"} · ${f.message} — ${f.likely_cause}`;
}
