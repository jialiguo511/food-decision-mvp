// apple-app-site-association, served at /.well-known/apple-app-site-association (rewrite in
// next.config.ts). Lets the iOS app open the emailed sign-in link instead of Safari. The app also
// needs the Associated Domains entitlement for this host (docs/IOS_RELEASE.md).
import { aasaBody } from "@/lib/aasa";

export const dynamic = "force-dynamic";

export function GET() {
  const body = aasaBody(process.env.APPLE_APP_IDS);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
