// The bundled iOS app asks this at launch: is my version still served? Always answered (never
// gated), with no personal data.
import { minAppVersion } from "@/lib/appOrigin";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ minVersion: minAppVersion() }, { headers: { "Cache-Control": "no-store" } });
}
