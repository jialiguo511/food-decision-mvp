// apple-app-site-association, served at /.well-known/apple-app-site-association (rewrite in
// next.config.ts). It lets the iOS app open the emailed sign-in link (/auth/confirm) instead of
// Safari. Off until APPLE_APP_IDS is set ("TEAMID.bundle.id", comma-separated); the app also needs
// the Associated Domains entitlement for this host (docs/IOS_RELEASE.md).

export const dynamic = "force-dynamic";

export function aasaBody(appIds: string | undefined): object | null {
  const ids = (appIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
  if (ids.length === 0) return null;
  return { applinks: { details: [{ appIDs: ids, components: [{ "/": "/auth/confirm", comment: "Emailed sign-in link" }] }] } };
}

export function GET() {
  const body = aasaBody(process.env.APPLE_APP_IDS);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
