// POST /api/image { session_id, index } | { saved_id } — one Cook card's picture, on demand,
// AFTER its text is already on screen. Entirely independent of /api/recommend:
// a slow or failed lookup here can never delay or break a recommendation, and
// every failure is a 200 with `{ url: null }` (the card keeps its quiet
// no-photo band), so the client never has to tell "no image" from "error".
//
// The recipe is read from the caller's own stored session by (session, index), or
// from their own Saved row — never taken from the request — so this can't be used to generate an image of
// arbitrary text, and every generation traces back to a card a real
// recommendation produced. Order: relevant real photo → cached generated image
// → generate once and cache (lib/images/recipeImage.ts).

import { NextResponse } from "next/server";
import { resolveImageProvider } from "@/lib/images";
import { resolveImageGenerator } from "@/lib/images/generated";
import { createSupabaseImageCache, resolveRecipeImage } from "@/lib/images/recipeImage";
import { storedRecommendationSchema } from "@/lib/recommend/output";
import { createClient } from "@/lib/supabase/server";

const EMPTY = { url: null } as const;

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

  const result = await resolveRecipeImage(parsed.data, {
    photos: resolveImageProvider(),
    cache: createSupabaseImageCache(supabase),
    generator: resolveImageGenerator(),
  });
  return NextResponse.json(result ?? EMPTY);
}
