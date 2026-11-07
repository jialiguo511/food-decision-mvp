// GET /api/place-photo?session_id=…&index=… — the real Google photo of one
// nearby place on one of the caller's cards, fetched server-side so the Places
// key never reaches the browser. Never a generated image: a restaurant card
// shows a real photo of the real place or a neutral placeholder.
//
// The photo reference is read from the caller's own stored session, not taken
// from the request (so this can't be pointed at arbitrary Google resources), and
// its shape was validated when stored. The image is a separate, billed Places
// request — made only when a card is actually shown (the client loads lazily),
// and cached by the browser for a day. 404 on any failure: the client treats
// that as "no photo".

import { storedRecommendationSchema } from "@/lib/recommend/output";
import { createClient } from "@/lib/supabase/server";

const NOT_FOUND = () => new Response(null, { status: 404 });

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NOT_FOUND();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NOT_FOUND();

  const params = new URL(request.url).searchParams;
  const sessionId = params.get("session_id");
  const index = Number(params.get("index"));
  if (!sessionId || !Number.isInteger(index) || index < 0 || index > 2) return NOT_FOUND();

  const { data } = await supabase.from("decision_sessions").select("recommendations").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  const card: unknown = Array.isArray(data?.recommendations) ? data.recommendations[index] : undefined;
  const parsed = storedRecommendationSchema.safeParse(card);
  if (!parsed.success || parsed.data.decision_mode !== "nearby" || !parsed.data.photo_name) return NOT_FOUND();

  try {
    const upstream = await fetch(`https://places.googleapis.com/v1/${parsed.data.photo_name}/media?maxWidthPx=640`, {
      headers: { "X-Goog-Api-Key": key },
      signal: AbortSignal.timeout(8000),
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      console.warn("[places] photo fetch failed", { status: upstream.status });
      return NOT_FOUND();
    }
    return new Response(upstream.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    console.warn("[places] photo fetch errored", error instanceof Error ? error.name : "error");
    return NOT_FOUND();
  }
}
