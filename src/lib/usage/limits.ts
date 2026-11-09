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

export type UsageKind = "recommend" | "nearby" | "interpret" | "enrich" | "image" | "place_photo" | "feedback";

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
  /** The feedback form. Not a paid call, but it writes a row from a public sign-up, so it is metered the same way. */
  feedback: 5,
};

/** The WHOLE APP's ceiling per UTC day for each kind, across every account — so ten
 *  thousand sign-ups still can't spend more than this. Rough worst-case dollars if a
 *  ceiling is hit for one day (my estimates from PLAN.md's per-call notes, not
 *  measurements): recommend 600 × ~$0.02 ≈ $12, nearby 150 × a few cents ≈ $5,
 *  interpret 1500 × a fraction of a cent, image 300 × ~$0.005 ≈ $1.5.
 *  This is the application's own line, enforced in Postgres. It is NOT a replacement
 *  for the spend caps at Anthropic / OpenAI / Google (RELEASE.md §6).
 *  Override a number with USAGE_GLOBAL_<KIND>. */
export const DEFAULT_GLOBAL_LIMITS: Record<UsageKind, number> = {
  recommend: 600,
  nearby: 150,
  interpret: 1500,
  enrich: 600,
  image: 300,
  place_photo: 1000,
  feedback: 200,
};

export const USAGE_KINDS = Object.keys(DEFAULT_LIMITS) as UsageKind[];

/** The limit for a kind: the default, or a positive whole number from
 *  USAGE_LIMIT_<KIND> if one is set. Anything else in the env is ignored. */
export function limitFor(kind: UsageKind, env: Record<string, string | undefined> = process.env): number {
  const raw = env[`USAGE_LIMIT_${kind.toUpperCase()}`]?.trim();
  const override = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(override) && override >= 1 ? override : DEFAULT_LIMITS[kind];
}

/** The app-wide daily ceiling for a kind (see DEFAULT_GLOBAL_LIMITS). Same rule as limitFor. */
export function globalLimitFor(kind: UsageKind, env: Record<string, string | undefined> = process.env): number {
  const raw = env[`USAGE_GLOBAL_${kind.toUpperCase()}`]?.trim();
  const override = raw && /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(override) && override >= 1 ? override : DEFAULT_GLOBAL_LIMITS[kind];
}

/** The off switch in the environment: PAUSED_KINDS="all" or a comma list ("recommend,image").
 *  It needs a redeploy to change; the database flag in app_flags (see the 2026-11-09
 *  migration) is the instant one, and is checked inside consume_usage. */
export function isPausedByEnv(kind: UsageKind, env: Record<string, string | undefined> = process.env): boolean {
  const list = (env.PAUSED_KINDS ?? "").toLowerCase().replace(/\s+/g, "").split(",").filter(Boolean);
  return list.includes("all") || list.includes(kind);
}
