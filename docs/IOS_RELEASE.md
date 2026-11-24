# iOS release — audit, approach, and checklist

Started 2026-11-24 on branch `feat/ios-app`, at the founder's explicit request. Status markers:
**verified** = checked by a test or a run on this branch; **assumed** = reasoned from the code or
vendor docs, not yet run on a device.

## Scope conflict (flagged, not silently resolved)

`PRODUCT.md` → Current non-goals and `PLAN.md` → LATER both list **"Native mobile app"**, and
`CLAUDE.md` repeats it. Building it needs a promotion in `PLAN.md` first. The founder asked for it
directly (2026-11-24); the promotion is recorded in `PLAN.md` → NEXT ("iOS app via Capacitor").
P2 items from the same request (interactive macro breakdowns, weekly planning, advanced tracking)
stay out: carbohydrate/fat targets and fixed weekly planning are excluded by `PRODUCT.md`.

## Architecture findings

| area | what exists | iOS impact |
|---|---|---|
| Framework | Next.js 15 App Router; every page under `/today`, `/saved`, `/profile` is a **Server Component** reading Supabase with the user's cookie; writes are **Server Actions** (6 action files); LLM, places and images are Route Handlers. | A fully bundled UI is not possible **as-is**; it needs the changes listed under "Production architecture" (≈ 8–12 days), not a rewrite. |
| Auth | Supabase email OTP. One email, a code (typed on `/login`, `verifyOtp` in the browser) and a link (`/auth/confirm`, POST-only verify). Session in cookies; `middleware.ts` refreshes it on every request. | **The code is the native-friendly path**: typed inside the app's WebView, it creates the session in the app's own cookie store. The link opens Safari/Gmail and signs in *there*, not the app, unless a Universal Link routes it back. |
| Session persistence | `@supabase/ssr` cookies, `SameSite=Lax`, `Secure` on https. | WKWebView keeps first-party cookies for the loaded origin across launches (assumed; to verify on device: force-quit → reopen stays signed in). |
| Location | `navigator.geolocation`, only from a tap. | Works in WKWebView; needs `NSLocationWhenInUseUsageDescription`. Denied/unavailable copy says "browser settings" — needs an app wording. |
| External links | 9 `target="_blank"` links (Maps, place websites, Pexels credits). | In a WebView they open inside the app with no way back unless routed to the system browser. Must be handled. |
| Account deletion | Me → Delete my account (server action + service-role delete). | Meets App Store 5.1.1(v) once reachable in-app (it is). |
| Paid-call metering, RLS, same-origin checks | Server-side. | Unchanged when the app loads the same origin. |
| Simulator on this Mac | Xcode 27.2 present; `simctl` fails (CoreSimulator framework missing). | Must be fixed before any simulator verification — see "Your setup". |

## Prototype built: Capacitor shell around the hosted app (`feat/ios-app`)

- **Capacitor 8** project in `ios/` (iPhone only, portrait). The WebView loads `CAP_SERVER_URL`
  (`npm run ios:sync`): `http://localhost:3000` for the Simulator, a Vercel Preview for a device.
  Every page, Server Action, API route, metering rule and RLS policy is reused unchanged.
- Native layer (`src/components/NativeBridge.tsx`, no-op in a browser): bundled can't-connect
  screen with Try again (`mobile/www/offline.html`, Capacitor `errorPath`); launch screen in cream
  with the mark, hidden after first paint; external links → Safari view / system apps; reload after
  30 min in the background (fresh session, fresh Home); our-origin Universal Link URLs load in the
  app; location purpose string and iPhone-Settings wording when denied; `viewport-fit=cover`
  (without it every safe-area inset was 0); code-first sign-in.
- **Not yet:** Associated Domains entitlement + `apple-app-site-association` (needs your Team ID
  and the final domain).

## Production architecture — hosted shell vs. bundled UI

Capacitor documents `server.url` as a development feature, and App Review 4.2 is a real risk for an
app whose every screen is fetched from a website. The question is how much it costs to ship the UI
**inside** the app while keeping Vercel + Supabase as the backend. It is not a rewrite:

**What exists today that a bundled UI cannot use directly**

| piece | count | why it can't be bundled as-is | change needed |
|---|---|---|---|
| Server-rendered signed-in pages | 3 that matter: `today/page.tsx` (166 lines of reads), `saved/page.tsx`, `profile/page.tsx` | they read Supabase on the server with the cookie session | move each page's reads into a shared loader (`loadHome`, `loadSaved`, `loadProfile`); the web page calls it as now, a new `GET /api/app/<screen>` returns the same props as JSON. Web unchanged. |
| Server Actions | 19 functions in 6 files, imported by 12 client modules | a Server Action is a POST to the page URL with a build-specific id — a separately built app can't call the deployed server's actions | one `POST /api/app/action` dispatcher that calls the **same** functions; a client adapter (`callAction`) used by those 12 modules — direct call on the web, `fetch` in the app |
| Session lookup | `lib/supabase/server.ts → createClient()` reads cookies | the app holds its session in supabase-js, not a cookie on our domain | accept `Authorization: Bearer <access token>` in `createClient()`; RLS then works exactly as now. One file. |
| Cross-site guard | `refuseCrossSite` on paid POST routes | the bundled app's origin is `capacitor://localhost` | allow that one origin **only** with a bearer token (no cookie → no CSRF), plus CORS for it |
| Sign-in | `/login` already verifies the code in the client | — | keep; persist the session with supabase-js in the app; sign-out/reset clear it |
| Route Handlers (`/api/recommend`, interpret, enrich, image, place-photo) | 6 | relative URLs | an API base URL in the app build; no server change beyond the bearer/CORS above |
| Build | one Next build | — | a second build target (`output: "export"`) for `/today`, `/saved`, `/profile`, `/login`, `/about`, using the same client components |

**Scope comparison (estimates, not measured)**

| | hosted shell (built) | bundled UI, same backend |
|---|---|---|
| Work beyond what is on the branch | ~1–2 days: Universal Links, device QA | ~8–12 working days: the table above, plus tests and device QA |
| Server changes | none | bearer auth in one file, one action dispatcher, three read endpoints, CORS |
| App Review 4.2 risk | real; mitigated by the native layer, not removed | low: the UI ships in the binary |
| No network | bundled error screen | app opens, screens show cached shell + retry |
| Shipping a UI fix | deploy the web app; every installed app gets it at once | needs an app update through review |
| Ongoing cost | none | **API compatibility**: every web deploy must keep working for app versions still installed |
| Rewrite (React Native/Expo) for comparison | — | 6–10 weeks, every screen again |

**Recommendation.** Ship the hosted shell to **TestFlight** now (internal testers don't go
through App Review; external testers get a lighter beta review). Do the bundled-UI work in parallel
as the **App Store** path, because 4.2 is the one risk we can't test our way out of. The P0/P1
fixes below are written against the shared client components, so they carry over unchanged.

## User-feedback fixes on this branch

| item | what changed | verified by |
|---|---|---|
| P0 Saved → "Find something to make" opened the last Eat-out set | links pass `?start=cook` / `?start=order`, which beats any restored or in-memory set | unit + real-HomeFlow tests |
| P0 Gmail spam | code-first copy, "Not spam" hint; the rest is DNS/dashboard (below) | test; **delivery not verified** |
| P0 iOS auth / returning users | code-first sign-in (types into the app's own WebView session); resume after 30 min reloads (session refresh); AASA route for the emailed link | tests; **sign-in on a device not yet tried** |
| P0 latency / errors / recovery | 100 s client deadline → "That took too long" + Try again (was: spinner up to the server's 200 s); after 15 s "Taking longer than usual" with **Stop and change my answers**; "You're offline" copy; iOS-specific location-denied copy | store tests with fake timers |
| P1 several compatible preferences | Cook craving chips multi-select (+ soft "Vegetarian"); "Light and clean" ⇄ "Comfort food" exclusive; Snack Sweet/Salty/Crunchy/Creamy combine, "Anything" alone. Get food's category stays single (drives place fit) | unit + flow tests; clicked through at 375 px |
| P1 Pickup / Delivery switching | Delivery · Pickup · Eat nearby switch on Get food results; same answers, new method. No price/fee comparison (no verified data; Google's coarse `$$` level stays as before) | real-HomeFlow test; clicked through at 375 px (stand-in data) |
| P1 optional profile completion | quiet card on Me listing only unset items with what each changes; not on Home | unit tests |
| P1 nutrition labels | "Estimate" label in words + "How?" on every card; `cal` everywhere | clicked through at 375 px |
| UI | warm palette tokens; all text pairs ≥ 4.5:1 (old orange button 3.2:1); `viewport-fit=cover` safe areas | contrast computed; screenshots |

Not changed, deliberately: Get food craving categories, onboarding, the three-card carousel layout.

## TestFlight readiness — four separate states

| state | status |
|---|---|
| **1. Technical build** | Debug Simulator build and unsigned Release device build **succeed** (Xcode 27.2). |
| **2. Simulator testing** | **done for what runs without a real sign-in** — iPhone 17, iOS 27.2, app loading the local dev server (run log below). |
| **3. Physical device** | **not done** — needs your Apple team for signing and a device. |
| **4. TestFlight** | **not done** — needs the steps below. Internal testers need no review; external testers need Beta App Review. |
| **5. App Store** | **not ready** — 4.2 decision (above), review notes, screenshots, privacy label. |

**Simulator run log (2026-11-24, iPhone 17 / iOS 27.2, Debug build, dev server):**

| check | result |
|---|---|
| Cold start → launch screen → sign-in page | ✅ cream launch screen with the mark; sign-in page within the safe areas |
| In-app navigation (sign-in → About) | ✅ |
| Decision flow on the fixture Home (`/dev/home`, stand-in data): sentence → nearby place cards, Cook questions | ✅ native bridge active (launch screen hidden by the page, lifecycle listeners registered) |
| External link (Maps on a place card) | ✅ opens a Safari sheet with a close button; closing returns to the app |
| Cold start with the server down | ✅ bundled "Can't reach the kitchen" screen; **Try again** loads the app once the server is back |
| Background → reopen from the icon | ✅ returns to the same question with its answer kept |
| Force-quit → reopen | ✅ starts cleanly |
| Bugs found and fixed during the run | launch screen could stay up forever on the offline page; white flash before first paint (WebView background now cream); offline button font; `appStartPath` stops the app at launch, so it was removed |

**Not tested on the Simulator:** sign-in with a real emailed code, session persistence across a restart, Saved / Me while signed in, location permission prompt (the fixture Home fakes location), real recommendations, account deletion. All need a real account and a deployed backend; they belong to the device / TestFlight pass.

**Steps to a TestFlight build (yours unless noted):**
1. Apple Developer: create the App ID (bundle id — `com.whatshouldieat.app` is a placeholder; it is permanent once uploaded) and the App Store Connect app record.
2. Deploy this branch to a **Vercel Preview** (needs your approval) and add that origin to Supabase Redirect URLs.
3. `CAP_SERVER_URL=https://<preview-origin> npm run ios:sync` (me), then open `ios/App/App.xcodeproj`, set Signing → Team, and Product → Archive → Distribute → TestFlight.
4. Optional, for the emailed link to open the app: set `APPLE_APP_IDS=<TEAMID>.<bundle id>` on Vercel and add `applinks:<host>` under Signing & Capabilities → Associated Domains.
5. App Store Connect: privacy policy URL (`/about`), beta description, a review contact, and a way for the reviewer to sign in (they need to receive the code — e.g. a dedicated inbox you share in the review notes).

## Gmail spam — what to change outside the code

The app cannot see the Supabase dashboard or DNS, so these are the likely causes in order. Each is
**assumed** until checked.

1. **Links to `*.vercel.app`.** The emailed link points at `food-decision-mvp.vercel.app`, a shared
   domain heavily used in phishing; Gmail weighs link domains. Fix: a custom domain for the app
   (Vercel → Domains), the **same** domain the email is sent from, then update Supabase Site URL
   and Redirect URLs.
   Stronger alternative: a **code-only template** (no link at all) — the code is the path the iOS
   app needs anyway. Template below.
2. **Sender authentication.** In Resend → Domains, the sending domain must show SPF and DKIM
   verified. Add a DMARC record (Gmail requires one for bulk senders and uses it for everyone):
   `_dmarc.<domain>  TXT  "v=DMARC1; p=none; rua=mailto:<you>@<domain>"` — move to
   `p=quarantine` after a couple of clean weeks. Send from a subdomain such as
   `auth.<domain>` so sign-in mail has its own reputation.
3. **Supabase must actually use Resend.** Authentication → Emails → SMTP Settings: enabled, host
   `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender
   `<Name> <signin@auth.<domain>>` with a real display name (the brand), not `noreply@…`.
4. **Resend tracking off.** Resend → Domains → the domain → disable *click tracking* and *open
   tracking*. Click tracking rewrites the sign-in link through a tracking host; that is a strong
   spam signal for a one-time-link email.
5. **Template.** Short, plain, one clear purpose, subject without "magic". Suggested, both the
   *Magic Link* and *Confirm signup* templates (subject: `Your <Brand> sign-in code`):
   ```html
   <p>Your sign-in code for <Brand> is:</p>
   <p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   <p>Type it in the app or on the sign-in page. It works once and expires in 10 minutes.</p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```
   This drops the link. Keep the current Step C template from `RELEASE.md` §6.7 instead if web
   users still need the cross-browser link; do it after items 1–4.
6. **Check a real delivery.** Send to a Gmail address, open *Show original*: `SPF: PASS`,
   `DKIM: PASS`, `DMARC: PASS`, and the `From` domain matching the DKIM `d=` domain.

## Your setup (cannot be done from code)

- Apple Developer Program membership; an App ID (bundle id to choose, e.g.
  `app.<domain>.whattoeat`) with Associated Domains enabled.
- Fix the simulator runtime: open Xcode → Settings → Components and install an iOS Simulator
  runtime (or run `xcodebuild -runFirstLaunch`, which needs your password).
- App Store Connect: app record, privacy policy URL (`/about` can serve), support URL, privacy
  "nutrition label" (email, coarse location used once and not stored, food preferences, health
  inputs such as age/weight if entered), age rating, test account notes for review (App Review
  needs a way in — an email inbox they can read, or a review-only code path; decide before
  submission).
