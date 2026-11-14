// POST /auth/confirm/verify — turns the emailed one-time token hash into a session.
//
// Only POST exists, on purpose. A GET (an email scanner, a link preview, a prefetch, a crawler)
// has nothing here to consume the token with; /auth/confirm shows a button and its click is what
// reaches this route. The token is single-use and expires (Supabase), is carried in the request
// BODY (never a URL, so it is in no access log and no Referer), is never echoed back, and never
// written to a log: failures log a short code only.
//
// No cookie from the browser that asked for the email is needed — that is what makes it work from
// Gmail's built-in browser. The session cookie is set on whichever browser POSTed.

import { NextResponse } from "next/server";
import { isConfirmType, isPlausibleTokenHash, type ConfirmFailure } from "@/lib/confirmToken";
import { isCrossSite } from "@/lib/sameOrigin";
import { safeNextPath } from "@/lib/safeNext";
import { createClient } from "@/lib/supabase/server";
import { clientIp, createWindowLimiter } from "@/lib/windowLimit";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 2000;
// Per client address, per instance. A real person taps the button once or twice, so 5 in five minutes
// is generous; Supabase's own per-IP limit still applies behind it (docs/RELEASE.md §6.7).
const limiter = createWindowLimiter({ limit: 5, windowMs: 5 * 60_000, maxKeys: 5000 });

function reply(status: number, body: { ok: true; next: string } | { ok: false; reason: ConfirmFailure }) {
  // A response carrying (or refusing) a sign-in is never stored by a browser, proxy or CDN.
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // A browser always sends Origin on a cross-site POST, and on a same-site fetch too. Unlike the
  // paid routes (which let a missing Origin through), this one wants it: the only caller is our
  // own confirm page.
  if (!request.headers.get("origin") || isCrossSite(request)) return reply(403, { ok: false, reason: "refused" });
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return reply(403, { ok: false, reason: "refused" });
  // JSON only: a cross-site <form> cannot send it without a CORS preflight, which we do not answer.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply(415, { ok: false, reason: "refused" });
  }

  if (!limiter.allow(clientIp(request))) return reply(429, { ok: false, reason: "rate" });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return reply(413, { ok: false, reason: "refused" });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, reason: "refused" });
  }
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!isPlausibleTokenHash(input.token_hash) || !isConfirmType(input.type)) return reply(400, { ok: false, reason: "invalid" });
  // Untrusted: only a plain path on this site is followed (lib/safeNext.ts).
  const next = safeNextPath(typeof input.next === "string" ? input.next : null);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: input.token_hash, type: input.type });
    if (error) {
      // Codes, never text: an auth error's message can echo what was sent.
      console.warn(`[auth/confirm] verify refused status=${error.status ?? "?"} code=${error.code ?? "?"}`);
      const limited = error.status === 429 || error.code === "over_request_rate_limit";
      return limited ? reply(429, { ok: false, reason: "rate" }) : reply(400, { ok: false, reason: "invalid" });
    }
  } catch {
    console.warn("[auth/confirm] verify unreachable");
    return reply(502, { ok: false, reason: "network" });
  }
  return reply(200, { ok: true, next });
}
