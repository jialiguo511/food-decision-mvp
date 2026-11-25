"use client";

// The bundled app's stand-in for a Server Action call: POST /api/app/actions/<name> (an explicit
// allowlist on the server, lib/app/actions.ts). Signed-out and network failures come back in the
// same `{ ok: false, error }` shape the actions use, so callers need no changes.
import { DATA_CHANGED } from "@/ios/config";

const SIGNED_OUT = { ok: false, error: "You are signed out. Please sign in again." };
const UNREACHABLE = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };

export async function callAction<T>(name: string, args: unknown[], { mutates = true }: { mutates?: boolean } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/app/actions/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ args }) });
  } catch {
    return UNREACHABLE as T;
  }
  if (response.status === 401) return SIGNED_OUT as T;
  const body = (await response.json().catch(() => null)) as { result?: unknown } | null;
  if (!response.ok || !body || !("result" in body)) return UNREACHABLE as T;
  if (mutates) window.dispatchEvent(new Event(DATA_CHANGED));
  return body.result as T;
}
