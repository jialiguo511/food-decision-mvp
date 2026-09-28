// GET /api/image?q=<image_query> — resolves one Cook recommendation's image
// on demand. Entirely independent of /api/recommend: this route is never
// called from there, and a slow or failed lookup here can never delay or
// break a recommendation. Every response is 200 with `{ url: null }` in any
// failure case (unauthenticated, missing query, no provider configured, no
// results, provider error) so the client never has to distinguish "no image"
// from "something went wrong" — see RecipeImage, which renders the same
// fallback either way.

import { NextResponse } from "next/server";
import { resolveImageProvider } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

const EMPTY = { url: null } as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(EMPTY);

  const query = new URL(request.url).searchParams.get("q");
  if (!query) return NextResponse.json(EMPTY);

  const result = await resolveImageProvider().resolve(query);
  return NextResponse.json(result ?? EMPTY);
}
