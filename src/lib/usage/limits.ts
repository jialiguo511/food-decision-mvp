// What one person may spend per day on each kind of PAID call — ONE place.
//
// A "kind" is a paid entry point, counted before the work starts and counted
// whether the work then succeeds or fails (it was paid for upstream either
// way). The numbers are for a small closed beta, chosen from the per-call cost
// notes in PLAN.md (a Cook request ≈ $0.02, a nearby search a few cents of
// Places, a generated picture ≈ $0.005, the sentence reader a fraction of a
// cent), so one enthusiastic user costs well under a dollar a day and one
// abusive one is capped at a few. Change a number here, or override one for a
// deployment with USAGE_LIMIT_<KIND> (e.g. USAGE_LIMIT_RECOMMEND=60).
//
// The day is a UTC day (supabase/migrations/2026-11-07_usage_and_events.sql).

export type UsageKind = "recommend" | "nearby" | "interpret" | "enrich" | "image" | "place_photo";

export const DEFAULT_LIMITS: Record<UsageKind, number> = {
  /** Every request for three suggestions, any mode, including "Show me 3 more". */
  recommend: 30,
  /** Of those, the ones that also run a Google Places search (billed per search). */
  nearby: 12,
  /** Reading a typed sentence. */
  interpret: 50,
  /** The model's wording for a nearby set — one call per set. */
  enrich: 30,
  /** Generating a recipe picture — only an actual generation counts; a cached or photo hit is free. */
  image: 40,
  /** Fetching a place photo from Google (billed per photo). */
  place_photo: 60,
};

export const USAGE_KINDS = Object.keys(DEFAULT_LIMITS) as UsageKind[];

/** The limit for a kind: the default, or a positive whole number from
 *  USAGE_LIMIT_<KIND> if one is set. Anything else in the env is ignored. */
export function limitFor(kind: UsageKind, env: Record<string, string | undefined> = process.env): number {
  const raw = env[`USAGE_LIMIT_${kind.toUpperCase()}`]?.trim();
  const override = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(override) && override >= 1 ? override : DEFAULT_LIMITS[kind];
}
