# iOS v1.0 beta — Release Readiness Report (2026-11-24)

Branch `feat/ios-app` (pushed). Nothing merged, deployed to Production, or uploaded.

## Verified
**Automated:** 1,480 tests (113 files), typecheck, lint, web production build — all pass. Unsigned
Release archive of the bundled app builds (Xcode 27.2).

**Real backend, bundled app, iPhone 18 Pro Max Simulator (6.9"), fresh test account `+wse-test4`
(deleted at the end):**
| area | result |
|---|---|
| Sign-in (check bridge → email code) | ✅ |
| Get food · Delivery | ✅ real ideas, Pexels photos captioned "illustrative" |
| Get food · Eat nearby (switch from Delivery) | ✅ native location prompt → real places, Google photos |
| Adjust → "I'll cook it" → equipment question → clarify → Cook | ✅ asks only what was missing |
| Background mid-request → reopen | ✅ result shown |
| Save recipe + place → Saved (both tabs) | ✅ |
| Me: allergy added → Save → enforced | ✅ asked for "a peanut butter cup", got no peanuts |
| Snack | ✅ |
| Keyboard on Home and Me | ✅ after fix |
| Offline (backend unreachable) | ✅ app opens, "You're offline" + Try again |
| Account deletion | ✅ back to sign-in |

Earlier runs (iPhone 17, accounts test2/test3): Pickup, Snack with two cravings, Saved remove,
sign-out, returning user, force-quit restore, update-required gate.

**Session expiry (automated, real supabase-js client, `src/ios/session.test.ts`):** valid session
used as is; expired access token refreshed **before** the request and the new one stored in the
Keychain; a refused refresh signs the person out and clears the Keychain; the request bridge never
sends an expired token; signed out sends no Authorization header. In-app "Sign in again" if the
server still says signed out.

**Two-account authorisation (automated, real Postgres + RLS):** B cannot read, save, choose or remove
A's data through the app API; no token → 401; unknown action / bad arguments / foreign origin refused.

## Fixed in this pass
1. **Tab bar over the keyboard.** iOS lifted it over the field being typed in → hidden while typing.
2. **Me lost unsaved edits silently.** An allergy added and left behind by switching tabs was gone. A
   compact "Unsaved changes · Save" bar now shows above the tab bar while there's something to save.
   (This is a small, deliberate exception to "no floating bars" — review it.)
3. Session-ended copy in the app says "Sign in again" (the web's "opens a new tab" made no sense there).

## Audit notes (no change needed)
Every control ≥ 44 pt; chips `aria-pressed`, options radio roles; every input labelled; text
contrast ≥ 4.5:1; safe areas correct on 6.9" and 6.3"; external links open in Safari.
Not checked: VoiceOver end to end, Dynamic Type at the largest sizes, iPad (not supported — iPhone only).

## Remaining blockers
| # | blocker | who |
|---|---|---|
| 1 | Apple Developer membership (signing, device install, TestFlight) | you |
| 2 | No physical-iPhone run yet (Keychain, location, camera-less flows on real hardware) | after #1 |
| 3 | Production must run this backend before a production-pointed app build | your approval to merge |
| 4 | Reviewer sign-in path: a readable inbox for the code (or Apple sign-in enabled) | you |
| 5 | Privacy policy (`/about`) must name all processors — check against METADATA.md | you |

## Guideline 4.2 / review risks
- **4.2 (minimum functionality) — now low.** The UI ships in the binary (static export); it opens and
  navigates offline; native sign-in sheet, Keychain session, native location, haptics, Safari views.
  No remote `server.url`. Remaining exposure: it is still a WebView rendering HTML — fine when it
  behaves like an app, which it now does.
- **4.8 (Sign in with Apple).** Not required: the app offers only its own email sign-in (no
  third-party social login). Required only if you ever add Google/Facebook sign-in.
- **5.1.1(v) account deletion.** ✅ in-app.
- **"Beta" wording.** "Public Beta" on the sign-in screen and About is fine for TestFlight; **remove
  it for App Store submission** (`src/lib/brand.ts` → `stage`), and take screenshots without it.
- **Health claims (1.4.1).** Nutrition shown as estimates with an explanation; allergy disclaimer
  shown. Keep the category Food & Drink, not Medical.
- **2.1 completeness.** Reviewer must be able to sign in (blocker #4) and get results (Preview/Prod
  must be up; usage limits must not block the reviewer — check per-person daily limits).

## Safest sequence
1. **Now (no Apple needed):** you review the PR `feat/ios-app` → `main` (don't merge yet).
2. **Apple approves membership →** create App ID (bundle id) + App Store Connect app record.
3. **Internal TestFlight against the Preview** (no production change):
   `APP_API_BASE=<preview> npm run ios:build` → set team/bundle id → Archive → upload *(your approval)*
   → install on your iPhone via TestFlight → run docs/TESTFLIGHT.md §5.
4. **Fix anything found on device** on `feat/ios-app`; Preview redeploys automatically.
5. **Production backend** (your approval): merge → smoke test web → curl `/api/app/config` →
   rollback = promote previous deployment (no migration involved). Details: RELEASE_IOS_BACKEND.md.
6. **Production app build:** `APP_API_BASE=https://<production>` → build number +1 → upload.
7. **External TestFlight** (Beta App Review, ~1 day) with the "What to Test" text.
8. **App Store:** remove "Public Beta", final screenshots, privacy label, review notes → submit *(your approval)*.

## Your manual actions, in order
1. Finish Apple Developer enrollment.
2. Choose the bundle id (permanent) and the store name; tell me both + your Team ID.
3. Create the App Store Connect record; fill App Privacy from METADATA.md (you own the answers).
4. Set up a reviewer inbox (or decide to enable Apple sign-in).
5. Approve: (a) the TestFlight upload, (b) the production merge, (c) the App Store submission — separately.
6. Optional cleanup: delete leftover test accounts `+wse-test1`, `+wse-test2` (test3/test4 already deleted); remove `localhost` from Turnstile hostnames.
