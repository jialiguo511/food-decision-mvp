// The apple-app-site-association body for the iOS app's Universal Links (served by
// src/app/api/aasa/route.ts). Null — so the route answers 404 — until APPLE_APP_IDS is set
// ("TEAMID.bundle.id", comma-separated). Only the sign-in confirmation path opens in the app.
export function aasaBody(appIds: string | undefined): object | null {
  const ids = (appIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
  if (ids.length === 0) return null;
  return { applinks: { details: [{ appIDs: ids, components: [{ "/": "/auth/confirm", comment: "Emailed sign-in link" }] }] } };
}
