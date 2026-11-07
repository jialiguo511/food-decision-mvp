// POST /api/recommend/enrich { session_id } — the wording for a nearby set that
// is already on screen. The places were picked by code (nearbyPicks.ts) and
// stored with a rule-written reason; this asks a fast model for each card's
// "why this fits" and "what to look for", merges them into the same stored
// row, and returns the full set. It never changes which places are shown, their
// order or their roles, and ANY failure here (no key, timeout, bad output)
// returns the set unchanged — the cards simply keep their rule-written reason.
//
// One call per session: once every place is enriched the route is a no-op, so a
// reload or a second tab can't spend the model twice on the same cards.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { toProfileInput } from "@/lib/profile";
import {
  applyEnrichment,
  buildEnrichInput,
  buildEnrichMessage,
  ENRICH_SYSTEM_PROMPT,
  parseEnrichment,
} from "@/lib/recommend/enrich";
import { parseStoredSession } from "@/lib/recommend/session";
import { recordEvent } from "@/lib/events/record";
import { createClient } from "@/lib/supabase/server";
import { createTimer } from "@/lib/timing";
import { consumeUsage } from "@/lib/usage/consume";
import type { NearbyRecommendation } from "@/lib/types";

export const maxDuration = 60;

/** A small, fast model is plenty for three short sentences; override with
 *  ENRICH_MODEL. Not the Cook recommender's model. */
const DEFAULT_ENRICH_MODEL = "claude-haiku-4-5-20251001";

export async function POST(request: Request) {
  const timer = createTimer("Nearby enrichment");
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await timer.stage("auth", () => supabase.auth.getUser());
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const sessionId = (await request.json().catch(() => null))?.session_id;
    if (typeof sessionId !== "string" || !sessionId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

    const [{ data: row, error }, { data: profileRow }] = await Promise.all([
      timer.stage("session", async () =>
        supabase
          .from("decision_sessions")
          .select("id, context, recommendations, chosen_index, created_at")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ),
      timer.stage("profile", async () => supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()),
    ]);
    if (error) console.error("[enrich] session read failed", { code: error.code, message: error.message });
    const restored = row ? parseStoredSession(row) : null;
    if (!restored) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { context, recommendations } = restored.session;
    const pending = recommendations.filter((r): r is NearbyRecommendation => r.decision_mode === "nearby" && r.enriched === false);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (context.decision_mode !== "order" || pending.length === 0 || !apiKey) {
      return NextResponse.json({ recommendations, enriched: pending.length === 0 });
    }

    // The model call below is paid: spend the daily allowance first. Out of it
    // (or unable to check) is not an error — the cards simply keep their
    // rule-written reasons, exactly as when the model fails.
    const usage = await timer.stage("usage", () => consumeUsage(supabase, "enrich"));
    if (!usage.allowed) {
      if (usage.reason === "limit") void recordEvent(supabase, user.id, { name: "limit_hit", props: { kind: "enrich" } });
      return NextResponse.json({ recommendations, enriched: false });
    }

    const profile = toProfileInput(profileRow);
    const input = buildEnrichInput(pending, context, profile);
    let text = "";
    try {
      const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 0 });
      const response = await timer.stage("model", () =>
        client.messages.create({
          model: process.env.ENRICH_MODEL?.trim() || DEFAULT_ENRICH_MODEL,
          max_tokens: 1200,
          system: ENRICH_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildEnrichMessage(input) }],
        }),
      );
      text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    } catch (failure) {
      console.warn("[enrich] model call failed; keeping rule-written reasons", failure instanceof Error ? failure.message : failure);
      return NextResponse.json({ recommendations, enriched: false });
    }

    const enrichment = parseEnrichment(text, pending, profile.allergies);
    if (enrichment.size === 0) {
      console.warn("[enrich] nothing usable in the model output; keeping rule-written reasons");
      return NextResponse.json({ recommendations, enriched: false });
    }
    const merged = applyEnrichment(recommendations, enrichment);

    // Best effort: the user already has the merged set from this response, so
    // a failed write only means a reload shows the rule-written reasons again.
    const { error: writeError } = await timer.stage("persist", async () =>
      supabase.from("decision_sessions").update({ recommendations: merged }).eq("id", sessionId).eq("user_id", user.id),
    );
    if (writeError) console.error("[enrich] couldn't store the enriched set", { code: writeError.code, message: writeError.message });

    return NextResponse.json({ recommendations: merged, enriched: true });
  } finally {
    timer.report();
  }
}
