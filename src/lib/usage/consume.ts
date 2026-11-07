// Spend one unit of a person's daily allowance for a paid call — BEFORE the call.
//
//   const usage = await consumeUsage(supabase, "recommend");
//   if (!usage.allowed) return refuse(usage);   // nothing was spent upstream
//
// The count lives in Postgres (public.consume_usage, one atomic statement under
// the caller's own session), so it is shared by every server instance, survives
// restarts and cold starts, and cannot be raced by simultaneous requests — which
// an in-memory counter on a serverless host could not promise. The browser
// disabling a button is a convenience; this is the limit.
//
// If the database can't answer, paid calls are REFUSED in production (an
// unmetered paid path is the thing this exists to prevent). In development, a
// database that simply hasn't had the migration yet is let through with a loud
// warning, so local work isn't blocked on it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { limitFor, type UsageKind } from "./limits";

export type UsageResult =
  | { allowed: true; used: number; limit: number }
  /** Over the daily limit. */
  | { allowed: false; reason: "limit"; used: number; limit: number }
  /** The allowance couldn't be checked (migration not run, database down). */
  | { allowed: false; reason: "unavailable" };

type Rpc = Pick<SupabaseClient, "rpc">;

let warnedMissing = false;

export async function consumeUsage(
  supabase: Rpc,
  kind: UsageKind,
  options: { env?: Record<string, string | undefined> } = {},
): Promise<UsageResult> {
  const env = options.env ?? process.env;
  const limit = limitFor(kind, env);
  try {
    const { data, error } = await supabase.rpc("consume_usage", { p_kind: kind, p_limit: limit });
    if (error) {
      const missing = error.code === "PGRST202" || error.code === "42883";
      if (missing && env.NODE_ENV !== "production") {
        if (!warnedMissing) {
          warnedMissing = true;
          console.warn("[usage] consume_usage() doesn't exist in this database, so daily limits are NOT enforced. Run supabase/migrations/2026-11-07_usage_and_events.sql. (In production this refuses paid calls instead.)");
        }
        return { allowed: true, used: 0, limit };
      }
      console.error("[usage] couldn't check the daily allowance", { kind, code: error.code, message: error.message });
      return { allowed: false, reason: "unavailable" };
    }
    const row = Array.isArray(data) ? (data[0] as { allowed?: unknown; used?: unknown } | undefined) : undefined;
    if (!row || typeof row.allowed !== "boolean") {
      console.error("[usage] unexpected answer from consume_usage", { kind });
      return { allowed: false, reason: "unavailable" };
    }
    const used = typeof row.used === "number" ? row.used : 0;
    return row.allowed ? { allowed: true, used, limit } : { allowed: false, reason: "limit", used, limit };
  } catch (failure) {
    console.error("[usage] allowance check threw", { kind, error: failure instanceof Error ? failure.name : "unknown" });
    return { allowed: false, reason: "unavailable" };
  }
}

/** Test hook: forget that the dev warning was shown. */
export function resetUsageWarning() {
  warnedMissing = false;
}
