# iOS v1.0 — backend compatibility and production deployment

## What this branch changes for existing users (production web)
- **No database migration.** `supabase/` is unchanged on `feat/ios-app`; schema, RLS and grants are as in production.
- **Existing API routes unchanged** (`/api/recommend`, `/interpret`, `/enrich`, `/image`, `/place-photo`): same paths, same request/response shapes. Additive: `also_craving` on snack requests is optional; old requests validate as before.
- **Additive routes only:** `/api/app/{config,home,saved,profile,ping}`, `/api/app/actions/<name>`, `/api/aasa` (404 until `APPLE_APP_IDS` is set), `/app/check`.
- **Web auth unchanged:** cookies, middleware refresh, Server Actions and the same-origin guard behave as before for every origin except `capacitor://localhost` *with a bearer token and no cookie*.
- **Web UI changes** are the P0/P1 fixes already reviewed (palette, cravings, method switch, estimates, profile card, recovery states). Home, Saved and Me now render through shared loaders/views — same props, covered by the existing page tests.

## Contract the iOS app depends on (keep it compatible)
| surface | rule for future web deploys |
|---|---|
| `GET /api/app/home` = HomeFlow props | add fields freely; don't remove or change the meaning of a field without raising `MIN_IOS_APP_VERSION` |
| `GET /api/app/saved`, `/profile` | same |
| `POST /api/app/actions/<name>` | never rename/remove an action or change argument order; add a new action name instead |
| `/api/recommend*`, `/api/image`, `/api/place-photo` | request fields additive and optional; responses additive |
| `/app/check` callback `whattoeat-auth://check#state=&token=` | don't change |
| `X-App-Version` | the app always sends it; middleware returns 426 below `MIN_IOS_APP_VERSION` |

When a breaking change is unavoidable: ship the new app version first, wait for adoption, then
deploy the backend change and raise `MIN_IOS_APP_VERSION` in the same deploy (older apps then show
"Update required" instead of failing).

`/api/app/ping` was the proof-of-concept probe; it is read-only and returns no personal data. It can
stay as a health check or be deleted before release.

## Production deployment — exact steps (needs your approval; nothing here has been done)
1. **Freeze**: no new commits on `feat/ios-app` except release fixes.
2. **Review** the branch diff against `main` (PR). CI = `npm run typecheck && npm run lint && npm test && npm run build`.
3. **Production environment variables** (Vercel → Production): nothing new is *required*.
   Optional: `MIN_IOS_APP_VERSION=1.0.0` (default is the same). Apple variables only once Apple sign-in is enabled.
   Confirm existing ones are set: `SUPABASE_SERVICE_ROLE_KEY` (account deletion), API keys, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. **Cloudflare Turnstile**: production hostname is already allowed (web sign-in works today). `/app/check` runs on the same hostname — nothing to add.
5. **Supabase**: no change. (Redirect URLs already include production.)
6. **Merge `feat/ios-app` → `main`** → Vercel deploys production.
7. **Smoke test production web** (5 minutes, your account): sign in, one Cook, one Get food, Saved, Me. Rollback = Vercel → Deployments → previous production → "Promote to Production" (no migration to undo).
8. **Smoke test the app endpoints**: `curl https://<prod>/api/app/config` → `{"minVersion":"1.0.0"}`; `curl -H "Origin: capacitor://localhost" -H "X-App-Version: 1.0.0" https://<prod>/api/app/home` → 401.
9. **Build the production app**: `APP_API_BASE=https://<prod> NEXT_PUBLIC_TURNSTILE_SITE_KEY=<public key> npm run ios:build`, set version/build, Archive in Xcode.

The app build must point at a backend that already serves `/api/app/*` — never archive against production before step 6.
