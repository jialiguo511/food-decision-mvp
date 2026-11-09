// Where the magic-link email lands. Exchanges the one-time code in the URL
// for a real session cookie, then sends the user into the app.

import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safeNext";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Untrusted: only a plain path on this site is followed (lib/safeNext.ts).
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
