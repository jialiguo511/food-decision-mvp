// POST /api/app/actions/<name> { args: [...] } — one allowlisted write for the iOS app
// (lib/app/actions.ts). The session is the app's bearer token, verified by the action itself.
import { APP_ACTIONS, argsAreValid } from "@/lib/app/actions";
import { NO_STORE } from "@/lib/app/route";
import { refuseCrossSite } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const { name } = await params;
  const entry = Object.prototype.hasOwnProperty.call(APP_ACTIONS, name) ? APP_ACTIONS[name] : undefined;
  if (!entry) return Response.json({ error: { code: "not_found" } }, { status: 404, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { args?: unknown } | null;
  if (!body || !argsAreValid(entry, body.args)) return Response.json({ error: { code: "invalid_args" } }, { status: 400, headers: NO_STORE });
  try {
    const result = await (entry.run as (...a: unknown[]) => Promise<unknown>)(...body.args);
    return Response.json({ result: result ?? null }, { headers: NO_STORE });
  } catch (error) {
    // A Server Action's redirect()/notFound() or an unexpected throw: no stack, no input in the log.
    console.error("[app-actions] failed", { name, error: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: { code: "server_error" } }, { status: 500, headers: NO_STORE });
  }
}
