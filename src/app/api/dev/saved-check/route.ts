// GET /api/dev/saved-check — development only (404 in production).
//
// "Save fails" can be any of five things: the user isn't who the database
// thinks, the tables aren't there, a grant or RLS policy refuses, the stored
// recommendation doesn't parse, or the payload violates a constraint. Open this
// URL in the browser you're signed in with and it runs each layer of the REAL
// path as YOU — the same server client, cookies and RLS the Save button uses —
// and reports which one fails, with the Postgres / PostgREST code. It writes one
// throwaway probe row per Saved table and deletes it straight away.

import { NextResponse } from "next/server";
import { storedRecommendationSchema } from "@/lib/recommend/output";
import { likelyCause } from "@/lib/saved/failure";
import { createClient } from "@/lib/supabase/server";

type Check = { step: string; ok: boolean; code?: string | null; message?: string; likely_cause?: string; note?: string };

export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const checks: Check[] = [];
  const add = (step: string, error: { code?: string; message?: string } | null, note?: string) =>
    checks.push(
      error
        ? { step, ok: false, code: error.code ?? null, message: error.message, likely_cause: likelyCause(error.code, error.message) }
        : { step, ok: true, ...(note ? { note } : {}) },
    );

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    add("auth: signed-in user", authError ?? { message: "No signed-in user on this request (sign in at /login first)." });
    return NextResponse.json({ ok: false, checks });
  }
  add("auth: signed-in user", null, `user ${user.id.slice(0, 8)}…`);

  // The newest session: does it exist, and does every card still parse?
  const { data: session, error: sessionError } = await supabase
    .from("decision_sessions")
    .select("id, recommendations")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  add("read newest decision_sessions row", sessionError, session ? `session ${session.id}` : "no sessions yet — generate recommendations first");
  if (session && Array.isArray(session.recommendations)) {
    session.recommendations.forEach((card: unknown, i: number) => {
      const tagged = typeof card === "object" && card !== null && !("decision_mode" in card) ? { ...card, decision_mode: "cook" } : card;
      const parsed = storedRecommendationSchema.safeParse(tagged);
      checks.push(
        parsed.success
          ? { step: `stored card ${i} parses`, ok: true, note: parsed.data.decision_mode }
          : { step: `stored card ${i} parses`, ok: false, message: `${parsed.error.issues[0]?.path.join(".") || "(root)"}: ${parsed.error.issues[0]?.message}`, likely_cause: "The stored card has an older/different shape than the code expects." },
      );
    });
  }

  // saved_recipes: read, write (as RLS sees it), clean up.
  const recipeKey = `__saved-check-${Date.now()}`;
  const read1 = await supabase.from("saved_recipes").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  add("saved_recipes: select", read1.error, `${read1.count ?? 0} saved`);
  const write1 = await supabase
    .from("saved_recipes")
    .upsert({ user_id: user.id, recipe_key: recipeKey, recipe: { probe: true } }, { onConflict: "user_id,recipe_key", ignoreDuplicates: true });
  add("saved_recipes: upsert (RLS insert)", write1.error);
  if (!write1.error) {
    const del = await supabase.from("saved_recipes").delete().eq("user_id", user.id).eq("recipe_key", recipeKey);
    add("saved_recipes: delete probe", del.error);
  }

  const placeId = `__saved-check-${Date.now()}`;
  const read2 = await supabase.from("saved_places").select("place_id", { count: "exact", head: true }).eq("user_id", user.id);
  add("saved_places: select", read2.error, `${read2.count ?? 0} saved`);
  const write2 = await supabase
    .from("saved_places")
    .upsert({ user_id: user.id, provider: "diagnostic", place_id: placeId, name: "probe" }, { onConflict: "user_id,provider,place_id", ignoreDuplicates: true });
  add("saved_places: upsert (RLS insert)", write2.error);
  if (!write2.error) {
    const del = await supabase.from("saved_places").delete().eq("user_id", user.id).eq("provider", "diagnostic").eq("place_id", placeId);
    add("saved_places: delete probe", del.error);
  }

  const fb = await supabase.from("place_feedback").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  add("place_feedback: select (read before a place save)", fb.error);

  const failing = checks.find((c) => !c.ok);
  return NextResponse.json({ ok: !failing, first_failure: failing ?? null, checks });
}
