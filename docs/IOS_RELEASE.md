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

> **Status: PROTOTYPE.** The hosted shell is for TestFlight beta testing only. It is not the
> approved App Store architecture — see "Production architecture" below, which needs your decision.

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

**Additions since Sign in with Apple (2026-11-24)** — the bundled UI also needs:

| piece | change | risk |
|---|---|---|
| Session storage | supabase-js session kept in the app (Capacitor Preferences) instead of cookies; bearer token on every server call | sign-out / reset / delete must clear it (today they rely on a full page load) |
| Apple + Email sign-in | unchanged client code (`signInWithIdToken`, `verifyOtp`) — both already run in the browser client | none new |
| Turnstile CAPTCHA | the bundled page's origin is `capacitor://localhost`; Turnstile may not accept that scheme | **unverified** — may need a server-side check for app requests (App Attest) instead of Turnstile; must be tested before committing |
| Email link (`/auth/confirm`) | Universal Link must open the bundled app and hand the token to the client | small |

**Recommendation (needs your approval before any of it starts).**
1. **Now:** TestFlight beta on the hosted shell (labelled prototype). Internal testers need no
   review; external testers go through Beta App Review, which is lighter than App Store review.
2. **Before App Store submission:** the bundled UI with the same Vercel + Supabase backend —
   ≈ 8–12 working days, estimated, done in this order so each step ships on its own and the web keeps working:
   (a) bearer-token support in `createClient()` + CORS/same-origin for the app origin;
   (b) `/api/app/*` read endpoints from shared loaders (web pages call the same loaders);
   (c) one action dispatcher + client adapter for the 19 Server Actions;
   (d) the static-export build target and session storage in the app;
   (e) the Turnstile question above, answered by a spike **first** — it's the one unknown that could
   change the plan.
3. **Not recommended:** a React Native rewrite (6–10 weeks, no gain the bundled UI doesn't give).

## Bundled-UI proof of concept — results (2026-11-24)

A screen shipped inside the app (`mobile/poc`, origin `capacitor://localhost`) against the real
Preview backend and Supabase. Build it with `CAP_WEB_DIR=mobile/poc` (see `scripts/ios-sync.mjs`).

| check | result |
|---|---|
| Supabase reachable from the app origin (CORS) | ✅ HTTP 200 |
| Vercel API from the app origin | ✅ `/api/app/ping` 200; CORS preflight allowed for `capacitor://localhost` (204), refused for other origins (403); a forged bearer token is rejected (`invalid_token`) |
| Turnstile widget runs in the app (Cloudflare test key) | ✅ token issued |
| Turnstile with the **real** key | ❌ error **110200** (address not allowed), even with `localhost` in Hostname Management and after a retry |
| Email code sign-in from the bundled screen | ❌ Supabase refuses the send: `captcha_failed` (confirmed by the founder on the Simulator; nothing was sent) |
| Bearer token from a real session → Row Level Security | **not verified** — no real session could be created from the bundled screen, and the browser check was skipped |
| Stored session survives relaunch | not verified (needs a sign-in first) |

**What it means.** Everything except sign-in works from a bundled screen. Sign-in is blocked by
CAPTCHA: Supabase requires a Turnstile token for every sign-in, and Cloudflare won't issue one to
a page whose address isn't a real web hostname. Turning CAPTCHA off is not an option (it protects
the public sign-up), and Supabase's CAPTCHA setting is project-wide.

**The fix to try first (≈ 1–2 days, unverified):** a *sign-in check bridge*. The app opens a tiny page
on our real domain (`/app/check`) in Apple's sign-in browser sheet (`ASWebAuthenticationSession`);
Turnstile runs there on an allowed hostname and hands the token back to the app through a return
URL; the app then sends the code exactly as now. Apple sign-in, once enabled, takes the same token.
If Cloudflare also refuses that sheet, the fallback is to keep only the sign-in screen hosted.

**Updated scope:** ≈ 8–12 days (unchanged list above) **+ 1–2 days** for the check bridge, plus
the bearer/RLS and stored-session checks, which need one successful sign-in from a bundled screen.

**Go / no-go: conditional GO.** Do the check-bridge spike first (1–2 days). **Update: the spike passed — see below.** Go to the full migration
only if (1) a bundled screen signs in with a real code through the bridge, (2) the bearer token
reads the user's own rows and nothing else, and (3) the session survives a relaunch. If (1) fails,
stay on the hosted shell for beta and decide about the hybrid sign-in before App Store submission.

## Sign-in check bridge spike — results (2026-11-24): PASSED

**Design.** The bundled app opens `/app/check` on our real Preview domain in Apple's
authentication sheet (`ASWebAuthenticationSession`, ephemeral; project-local `WebAuthPlugin.swift`,
no Apple signing or entitlement). Only Turnstile runs there. The page returns the one-time Turnstile
token through `whattoeat-auth://check#state=…&token=…`, bound to a random 32-byte `state` the app
checks. The bundled app then calls Supabase itself (`signInWithOtp` with that token, `verifyOtp` on
the device), so the **session is created directly in the app and never travels through a URL, a log
or our server**; nothing is stored server-side; no database change. This is simpler and safer than
handing a session over from a hosted page (which would need server-side storage and a server-side
`verifyOtp`, sharing one IP rate-limit bucket for every user).

**Run:** iPhone 17 Simulator, bundled screen at `capacitor://localhost`, real Preview + production
Supabase project, fresh test account `+wse-test2` (code received and typed by the founder).

| # | test | result |
|---|---|---|
| 1 | Request the email code from the bundled app | ✅ Supabase accepted the token issued on our domain and sent from the app's origin |
| 2 | Code arrives and verifies | ✅ verified on the device |
| 3 | App holds a valid session | ✅ stored in the app's own storage |
| 4 | Force-quit → reopen | ✅ session restored |
| 5 | Logout (global) | ✅ stored session cleared; the old refresh token refused (`refresh_token_not_found`); relaunch starts signed out |
| 6 | Refresh | ✅ new access token, later expiry (also after relaunch) |
| 7 | Authenticated API from the bundled origin | ✅ `/api/app/ping` with bearer → `signedIn=true`, RLS read as the user |
| 8 | Other users' data | ✅ 0 rows of anyone else in `profiles`, `saved_recipes`, `saved_places`, `decision_sessions` (the same database holds other accounts' rows, e.g. test account 1's profile and saved recipe) |
| 9 | Replays and forgeries | ✅ reused check token → `captcha_failed`; reused code and wrong code → `otp_expired`; tampered bearer → `invalid_token`; callback with another `state` → dropped |
| — | Expiry of an access token that is never refreshed | **not directly tested** (needs ~1 h); Supabase rejects expired JWTs in `getUser`, and the app refreshes automatically |
| — | Physical iPhone | not tested (no Apple signing yet) |

**Found and fixed:** Capacitor's debug console printed plugin results, including the bridge callback
URL with the one-time token. `loggingBehavior: "none"` now; re-checked: nothing logged.

**Manual configuration: none.** The Preview hostname is already allowed in Turnstile; the
`localhost` entry added for the earlier test is no longer needed and can be removed. Production
auth settings, Turnstile and CAPTCHA were not changed.

## Plan — migrating Home, Saved and Me to the bundled UI (not started; needs your go)

Order chosen so the web app and the hosted beta keep working at every step.

1. **Auth (≈ 1.5 days).** Productize the spike: the real sign-in screen (Email code; Apple behind its
   switch) using the bridge; session in Capacitor Preferences (Keychain-backed) instead of
   localStorage; sign-out / Reset / Delete clear it; a "session expired" path back to sign-in.
2. **Server: bearer + CORS (≈ 1 day).** `createClient()` accepts `Authorization: Bearer` when there is
   no cookie; CORS for `capacitor://localhost` on `/api/*`; `refuseCrossSite` lets the app origin
   through only with a bearer (no cookie → no CSRF). Tests for both paths.
3. **Reads (≈ 2 days).** Move the reads of `today/page.tsx`, `saved/page.tsx`, `profile/page.tsx`
   into shared loaders; the web pages call them unchanged; `GET /api/app/home|saved|profile` return
   the same props as JSON.
4. **Writes (≈ 2 days).** One `POST /api/app/action` dispatcher calling the same 19 Server Action
   functions; a `callAction` adapter in the 12 client modules (direct call on the web, fetch in the app).
5. **Bundled build (≈ 2–3 days).** A second build target that exports Home, Saved, Me, sign-in and
   About with the same client components, an API base URL, and the native layer already built;
   images and place photos from absolute URLs.
6. **Hardening and device QA (≈ 2 days).** Version header + "please update" response for old app
   builds; offline/first-launch states; full test script on a real iPhone.

**Total ≈ 10–12 working days** (estimate). Risks: keeping old app versions working as the API changes
(step 6 mitigates); Server Actions that call `revalidatePath` or redirect need small adjustments;
first launch offline shows the shell but no data.

## Real end-to-end run on the Preview (2026-11-24, iPhone 17 Simulator, hosted shell)

Isolated test account (a `+alias` address), production Supabase project; nothing else touched,
no account deleted.

| flow | result |
|---|---|
| Email code sign-in in the app | ✅ (founder typed the code) → first-run setup |
| Allergy (Peanuts) + diet (Vegetarian) in setup | ✅ saved, shown in Me |
| Cook (equipment, 20 min, ~$10, Light and clean + High protein) | ✅ 3 real vegetarian recipes, ~10–15 s, photos, "Estimate" labels |
| Save a recipe → Saved | ✅ appears with photo; Places empty state → opens Get food |
| Delivery | ✅ 3 real vegetarian ideas, no prices or fees invented |
| Pickup: location **Don't Allow** | ✅ iPhone-Settings copy + "Get food ideas by type" |
| …then location turned on → Try again | ❌ first run (WebView kept the denial) → **fixed** with native location → ✅ real nearby places with Google photos |
| Eat nearby | ✅ real places |
| Snack, Sweet + Crunchy | ✅ 3 matching snacks; "Taking longer than usual" + Stop appeared for real past 15 s |
| Relaunch (and reinstall) | ✅ still signed in, last results restored |
| Me: optional-details card, sign-in methods | ✅ only unset items listed |
| Bugs found and fixed | stuck location denial; method switch opened the Adjust box; "Around Under $15" |
| Not run | account deletion (kept the test account; non-destructive), offline on the Preview (offline screen verified earlier against a stopped server) |

## Sign in with Apple (iOS app) + Email code

- **Built:** native Apple sheet (project-local plugin `ios/App/App/AppleSignInPlugin.swift`, no
  third-party code on the login path) → Supabase `signInWithIdToken` in the browser client → the
  same cookie session the server reads for email users. Apple is first on the iOS sign-in page;
  Email code stays below it and is the only option on the web.
- **Duplicates:** Supabase links a matching *verified* email itself. When Apple sign-in *creates*
  an account (e.g. Hide My Email), the page asks: keep it, or "I already have an account — use my
  email" (deletes the empty new account, revokes Apple, returns to the email form). Me → Sign-in
  methods → **Add** links Apple to a signed-in email account (Supabase manual linking).
- **Deletion:** Me → Delete asks Apple for a fresh code and the server revokes the Apple
  authorization (5.1.1(v)); never blocks deletion.
- **Verified:** unit tests (nonce, first-sign-in detection, relay detection, ES256 client secret,
  revocation calls and failures, deletion order); in the Simulator the button calls the native
  plugin and Apple's sheet opens (it then asks for an Apple Account, which a Simulator doesn't
  have). **Not verified:** a real Apple sign-in, linking, or revocation — they need your Apple
  Developer setup and a signed build on a device.

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
| **1. Technical build** | Debug Simulator build, unsigned Release device build and unsigned **Release archive** succeed (Xcode 27.2). A signed archive needs your team. |
| **2. Simulator testing** | **done for what runs without a real sign-in** — iPhone 17, iOS 27.2, app loading the local dev server (run log below). |
| **2b. Real backend (Vercel Preview)** | Deployed from `feat/ios-app` (public, no Deployment Protection). Verified: app loads the real sign-in page from the Preview in the Simulator; unauthenticated `/api/recommend` → 401, cross-site → 403; security headers present. **Sign-in blocked** by Turnstile hostname (110200) until you allowlist it — so no real recommendation has been run from the app yet. |
| **3. Physical device** | **not done** — needs your Apple team for signing and a device. Runbook: docs/TESTFLIGHT.md. |
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
