// POST /api/image { session_id, index } | { saved_id } — one Cook card's picture, on demand,
// AFTER its text is already on screen. Entirely independent of /api/recommend:
// a slow or failed lookup here can never delay or break a recommendation, and
// every failure is a 200 with `{ url: null, reason }`, so a slow or failed
// picture never turns into an error page. `reason` lets the card tell "nothing
// to show" (no_image, unavailable — settled) from "worth another try"
// (generation_failed). A dropped connection or a 5xx is the client's own
// "request failed", which it also offers to retry.
//
// The recipe is read from the caller's own stored session by (session, index), or
// from their own Saved row — never taken from the request — so this can't be used to generate an image of
// arbitrary text, and every generation traces back to a card a real
// recommendation produced. Order: relevant real photo → cached generated image
// → generate once and cache (lib/images/recipeImage.ts).

import { NextResponse } from "next/server";
import { resolveImageProvider } from "@/lib/images";
import { resolveImageGenerator } from "@/lib/images/generated";
import { createSupabaseImageCache, resolveRecipeImageOutcome } from "@/lib/images/recipeImage";
import { storedRecommendationSchema } from "@/lib/recommend/output";
import { createClient } from "@/lib/supabase/server";

// A generation can take most of a minute (generated.ts: 45 s timeout). Without
// this the host's default function limit can kill the request AFTER the image
// vendor has been paid and BEFORE the picture is stored — money spent, nothing
// cached, and the next request pays again.
export const maxDuration = 60;

const EMPTY = { url: null, reason: "unavailable" } as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(EMPTY);

  const body: unknown = await request.json().catch(() => null);
  const { session_id, index, saved_id } = (typeof body === "object" && body !== null ? body : {}) as { session_id?: unknown; index?: unknown; saved_id?: unknown };

  let card: unknown;
  if (typeof saved_id === "string" && saved_id) {
    const { data, error } = await supabase.from("saved_recipes").select("recipe").eq("id", saved_id).eq("user_id", user.id).maybeSingle();
    if (error) console.warn("[images] saved read failed", { code: error.code });
    card = data?.recipe;
  } else if (typeof session_id === "string" && session_id && typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= 2) {
    const { data, error } = await supabase.from("decision_sessions").select("recommendations").eq("id", session_id).eq("user_id", user.id).maybeSingle();
    if (error) console.warn("[images] session read failed", { code: error.code });
    card = Array.isArray(data?.recommendations) ? data.recommendations[index] : undefined;
  }
  const parsed = storedRecommendationSchema.safeParse(typeof card === "object" && card !== null && !("decision_mode" in card) ? { ...card, decision_mode: "cook" } : card);
  if (!parsed.success || parsed.data.decision_mode !== "cook") return NextResponse.json(EMPTY);

  const outcome = await resolveRecipeImageOutcome(parsed.data, {
    photos: resolveImageProvider(),
    cache: createSupabaseImageCache(supabase),
    generator: resolveImageGenerator(),
  });
  return NextResponse.json("image" in outcome ? outcome.image : { url: null, reason: outcome.none });
}
