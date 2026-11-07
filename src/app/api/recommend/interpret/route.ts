// POST /api/recommend/interpret { text } — one sentence about the user's
// situation, read into the app's existing answer vocabulary. It returns fields,
// never prose, and it never recommends: the cards still come from
// /api/recommend, with the same hard constraints, validation and exactly-3
// contract. This route never sees the Profile — allergies and health notes are
// applied later, in the recommender, and cannot be touched from here.
//
// The text is untrusted. It is length-capped before any model call, wrapped as
// quoted data, answered only through a forced tool call, and the answer is
// checked against a closed vocabulary (lib/interpret/schema.ts). It is not
// stored and not logged: the log line carries sizes, timing and a count of
// fields — never the text, never a field's value.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { readSituation } from "@/lib/interpret/read";
import { isEmptyInterpretation, validateInterpretText, type Interpretation, type InterpretErrorCode } from "@/lib/interpret/schema";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const STATUS: Record<InterpretErrorCode, number> = {
  unauthenticated: 401,
  empty: 400,
  too_long: 400,
  not_configured: 503,
  nothing_found: 422,
  unavailable: 502,
  timeout: 504,
  limit_reached: 429,
};

const fail = (error: InterpretErrorCode) => NextResponse.json({ error }, { status: STATUS[error] });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated");

  const body: unknown = await request.json().catch(() => null);
  const checked = validateInterpretText(typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined);
  if (!checked.ok) return fail(checked.reason);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail("not_configured");

  const startedAt = Date.now();
  let interpretation: Interpretation;
  try {
    interpretation = await readSituation(checked.text, apiKey);
  } catch (failure) {
    const timedOut = failure instanceof Anthropic.APIConnectionTimeoutError;
    // The error's message can echo the request; the class and status are enough.
    console.warn("[interpret] model call failed", { kind: failure instanceof Error ? failure.name : "unknown", status: failure instanceof Anthropic.APIError ? failure.status : null, ms: Date.now() - startedAt });
    return fail(timedOut ? "timeout" : "unavailable");
  }

  const empty = isEmptyInterpretation(interpretation);
  console.info("[interpret]", { chars: checked.text.length, ms: Date.now() - startedAt, empty, mode: interpretation.mode });
  if (empty) return fail("nothing_found");
  return NextResponse.json({ interpretation });
}
