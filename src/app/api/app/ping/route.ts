// Bundled-UI proof of concept: can an app-bundled screen reach this backend with a bearer token,
// and does Row Level Security apply to it exactly as to a cookie session? READ-ONLY: it verifies the
// token with Supabase and reads whether the caller's own profile row exists (through RLS, as them).
// Returns no personal data. Not used by the web app.

import { createClient as createSupabase } from "@supabase/supabase-js";
import { appCorsHeaders, bearerToken } from "@/lib/appOrigin";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  const cors = appCorsHeaders(request.headers.get("origin"));
  return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
}

export async function GET(request: Request) {
  const cors = { ...appCorsHeaders(request.headers.get("origin")), "Cache-Control": "no-store" };
  if (!isSupabaseConfigured) return Response.json({ ok: false, error: "not_configured" }, { status: 503, headers: cors });
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return Response.json({ ok: true, signedIn: false }, { headers: cors });

  // A client that acts AS the token's user: RLS sees auth.uid() = that user.
  const supabase = createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return Response.json({ ok: true, signedIn: false, reason: "invalid_token" }, { status: 401, headers: cors });
  const profile = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  return Response.json(
    { ok: true, signedIn: true, rlsRead: profile.error ? `error:${profile.error.code}` : profile.data ? "own_row" : "no_row" },
    { headers: cors },
  );
}
