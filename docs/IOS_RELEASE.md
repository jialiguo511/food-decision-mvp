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
| Framework | Next.js 15 App Router; every page under `/today`, `/saved`, `/profile` is a **Server Component** reading Supabase with the user's cookie; writes are **Server Actions** (6 action files); LLM, places and images are Route Handlers. | `output: "export"` (a fully bundled UI) is **not** possible without rewriting every page to client-side reads and every Server Action to an authenticated API. That is a multi-week rewrite of stable code. |
| Auth | Supabase email OTP. One email, a code (typed on `/login`, `verifyOtp` in the browser) and a link (`/auth/confirm`, POST-only verify). Session in cookies; `middleware.ts` refreshes it on every request. | **The code is the native-friendly path**: typed inside the app's WebView, it creates the session in the app's own cookie store. The link opens Safari/Gmail and signs in *there*, not the app, unless a Universal Link routes it back. |
| Session persistence | `@supabase/ssr` cookies, `SameSite=Lax`, `Secure` on https. | WKWebView keeps first-party cookies for the loaded origin across launches (assumed; to verify on device: force-quit → reopen stays signed in). |
| Location | `navigator.geolocation`, only from a tap. | Works in WKWebView; needs `NSLocationWhenInUseUsageDescription`. Denied/unavailable copy says "browser settings" — needs an app wording. |
| External links | 9 `target="_blank"` links (Maps, place websites, Pexels credits). | In a WebView they open inside the app with no way back unless routed to the system browser. Must be handled. |
| Account deletion | Me → Delete my account (server action + service-role delete). | Meets App Store 5.1.1(v) once reachable in-app (it is). |
| Paid-call metering, RLS, same-origin checks | Server-side. | Unchanged when the app loads the same origin. |
| Simulator on this Mac | Xcode 27.2 present; `simctl` fails (CoreSimulator framework missing). | Must be fixed before any simulator verification — see "Your setup". |

## Recommended approach: Capacitor shell around the hosted app, with a native layer

One option, chosen for maximum reuse and smallest change:

- **Capacitor 7 iOS project** in `ios/`, `server.url` = the deployed origin (Preview first, then
  production). All pages, Server Actions, API routes, metering and RLS are reused unchanged.
- **Not a bare wrapper** — the native layer the app gets:
  - bundled offline / can't-connect screen with Retry (a WebView with no network otherwise shows
    a blank page), and a native splash so launch never flashes white;
  - **code-first sign-in** (done on this branch) + **Universal Links** for `/auth/confirm` so the
    emailed link opens the app, not Safari (`apple-app-site-association` served by Next);
  - external links (Maps, websites) opened in the system browser / Apple Maps via
    `@capacitor/browser`;
  - native location permission string and app-specific denied copy;
  - resume handling (`@capacitor/app`): on return from background after a while, reload so the
    middleware refreshes the session and Home re-reads state;
  - status bar / safe-area insets, haptics on the main choice, app icon and launch assets.
- **Risk, stated plainly:** App Review guideline 4.2 ("minimum functionality") rejects apps that
  are just a website. The native layer above is the mitigation; it is not a guarantee. If Apple
  rejects, the fallback is the bundled-UI rewrite (client reads via supabase-js + RLS, actions as
  token-authenticated routes) — larger, and only worth doing on that evidence.

Rejected: Expo/React Native rewrite (re-implements every screen); static export now (rewrite above).

## P0 status

| item | status |
|---|---|
| Saved → "Find something to make" opened the last Eat-out set | **Fixed, verified by tests.** Bare `/today` reopened the most recent session; links now pass `?start=cook` / `?start=order`, which beats any restored or in-memory set (`flow/homeReducer.ts → initialScreen`). |
| Sign-in emails in Gmail spam | Code-level part done (code-first copy, "Not spam" hint). The causes are mostly outside the code — see below. |
| iOS auth / returning users | Code-first sign-in done. Universal Links and resume handling: with the Capacitor work. |
| Recommendation latency / errors / recovery | Not started on this branch. |

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
