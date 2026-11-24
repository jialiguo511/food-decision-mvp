# iOS beta — TestFlight runbook

Branch `feat/ios-app`. Preview (stable branch URL, redeploys on every push):
`https://food-decision-mvp-git-feat-ios-app-jialiguo511.vercel.app`.
The app is the **prototype hosted shell** (docs/IOS_RELEASE.md): its screens load from that URL.

> The Preview uses the **same Supabase project as production** (checked 2026-11-24). Anything you do
> on it with a real account is real data in the live database. No migrations are needed for this
> branch.

## 1. Your manual actions, in order

Each step says where, what, and how to tell it worked.

**A. Cloudflare Turnstile (blocks every sign-in on the Preview today)**
1. Cloudflare dashboard → Turnstile → your widget → *Hostname Management* → add
   `food-decision-mvp-git-feat-ios-app-jialiguo511.vercel.app` → Save.
2. Worked when: the sign-in page on that URL no longer shows "The check isn't enabled for this
   address (code 110200)".

**B. Supabase → Authentication → URL Configuration**
1. Redirect URLs → add `https://food-decision-mvp-git-feat-ios-app-jialiguo511.vercel.app/**`.
   (Only the emailed *link* uses this; the code works without it.)

**C. Apple Developer (developer.apple.com → Certificates, Identifiers & Profiles)**
1. *Identifiers* → **+** → App IDs → App → Description "What to Eat", Bundle ID **Explicit**:
   your final id (see §2). Capabilities: tick **Sign In with Apple** (Enable as a primary App ID).
   Optional: **Associated Domains** (only for the emailed link to open the app). Register.
2. *Keys* → **+** → name "Sign in with Apple — Supabase" → tick **Sign In with Apple** → Configure →
   Primary App ID = the one above → Save → Continue → Register → **Download** the `.p8` (only once).
   Note the **Key ID**. Your **Team ID** is at the top right of the page.

**D. Supabase → Authentication → Sign In / Providers**
1. **Apple** → Enable. *Client IDs*: your bundle id (e.g. `com.example.whattoeat`). Native iOS
   sign-in needs only this; leave the OAuth secret empty unless you later add Apple on the web.
2. Same page (or *Auth settings*): turn on **Allow manual linking** — needed for Me → Sign-in
   methods → Add Apple.
3. Check *Attack Protection → CAPTCHA* is still Turnstile (Apple sign-in now sends the token too).

**E. Vercel → Project → Settings → Environment Variables** (scope: **Preview**, optionally only
branch `feat/ios-app`; never paste these anywhere else)
- `APPLE_TEAM_ID` = Team ID · `APPLE_KEY_ID` = Key ID · `APPLE_CLIENT_ID` = bundle id ·
  `APPLE_SIGNIN_PRIVATE_KEY` = the whole `.p8` file text (newlines may be written as `\n`).
- Optional, for the email link to open the app: `APPLE_APP_IDS` = `<TEAMID>.<bundle id>`.
- Then redeploy the branch (Deployments → the latest `feat/ios-app` → Redeploy), or tell me and I'll
  push an empty commit.

**F. Tell me the bundle id and Team ID.** I set them in the Xcode project (no secrets involved), run
`CAP_SERVER_URL=<preview> npm run ios:sync`, and rebuild.

**G. Xcode, on this Mac** (needs your Apple ID signed in: Xcode → Settings → Accounts)
1. `npm run ios:open` → target **App** → *Signing & Capabilities* → Team = yours, "Automatically
   manage signing" on. *Sign In with Apple* is already listed (from `App.entitlements`).
2. To install on your iPhone: plug it in (or same Wi-Fi with "Connect via network"), enable
   Developer Mode on the phone (Settings → Privacy & Security → Developer Mode), choose it as the
   run destination, **Run**.
3. For TestFlight: destination **Any iOS Device (arm64)** → Product → **Archive** → Organizer →
   **Distribute App** → App Store Connect → Upload. (I don't upload without your approval.)

**H. App Store Connect (appstoreconnect.apple.com) → Apps → +**
New App: iOS · Name (must be unique on the store — see §3) · language · bundle id from C · SKU
(any, e.g. `whattoeat-ios`). Then *TestFlight* → after the build processes (~10–30 min):
- **Internal testing:** add yourself / up to 100 App Store Connect users. No review.
- **External testing:** create a group, add testers by email or a public link. Needs *Test
  Information* (beta description, feedback email, privacy policy URL) and **Beta App Review**
  (usually ≤ 1 day). Review notes must say how to sign in: Sign in with Apple works for the
  reviewer; or give a dedicated email inbox they can read for the code.

## 2. Bundle identifier

It is permanent after the first upload. Recommendation: reverse-DNS of a domain you control, not
tied to the placeholder product name (the name may change, the id can't), e.g.
`com.<yourdomain>.mealdecider`. The project currently uses the placeholder `com.whatshouldieat.app`;
only keep it if you're happy to own it forever. Avoid your personal name in it.

## 3. Store listing (drafts — edit freely)

| field | draft |
|---|---|
| Name (≤ 30) | "What Should I Eat?" — check availability; "What to Eat" is likely taken. Home-screen label: "What to Eat" (`src/lib/brand.ts`, `capacitor.config.ts`). |
| Subtitle (≤ 30) | "3 meal ideas for right now" |
| Category | Food & Drink (secondary: Health & Fitness — optional) |
| Age rating | 4+ (no restricted content) |
| Privacy policy URL | `https://<production>/about` (make sure it covers Apple sign-in and the processors below) |
| Support URL | `https://<production>/feedback` |
| Description | One decision, three options: cook with what you have, get food nearby or delivered, or grab a snack — fitted to your allergies, diet, time and budget. Nutrition numbers are estimates. |
| Screenshots | 6.9" iPhone (1320 × 2868) required. **Take them from a real signed-in session** (Home, Cook card, Get food switch, Saved, Me) — not from the fixture page. |
| Icon / launch | Done: 1024² no-alpha icon and cream launch screen (`scripts/ios-assets.mjs`). |

## 4. Privacy and account deletion (App Store requirements)

- **Account deletion in-app:** Me → Account & data → Delete my account. Deletes all rows, the auth
  user, and (Apple accounts) revokes Sign in with Apple. ✅ built; ⚠️ Apple revocation unverified.
- **App Privacy "nutrition label"** — answer in App Store Connect (my reading of the code; you own
  the answers):
  - Contact info → Email address: collected, linked to the user, App Functionality.
  - Health & Fitness → (optional profile: age, sex, height, weight, activity, goal): collected,
    linked, App Functionality.
  - User content → food preferences, allergies, saved recipes/places, "did you eat it" feedback:
    collected, linked, App Functionality.
  - Usage data → product events (names + enumerated values only): collected, linked, Analytics.
  - Location: precise coordinates are sent for one nearby search and **not stored** — Apple's
    definition of "collected" excludes data not retained beyond servicing the request; confirm
    that reading before answering "not collected".
  - Not used for tracking; no ads.
- **Processors** (say so in the privacy policy): Supabase (auth, database), Anthropic (food
  preferences and the request), Google Places (location for one search), OpenAI and Pexels (dish
  descriptions for pictures), Vercel (hosting), Cloudflare Turnstile, Apple (Sign in with Apple).
- `ITSAppUsesNonExemptEncryption = false` is set (HTTPS only) — no export-compliance prompt.

## 5. What you need to test (needs your inbox / iPhone)

Do these on your iPhone with the TestFlight or Xcode-installed build, after §1 A–G.

| # | action | expected |
|---|---|---|
| 1 | Open the app | cream launch screen → sign-in page; Apple button on top, email below |
| 2 | Email: enter your email → "Email me a sign-in code" → type the 8-digit code | Home ("What should I eat?") with bottom nav Home / Saved / Me |
| 3 | Force-quit (swipe up), reopen | still signed in, same Home |
| 4 | Make something → answer → Show me meals | 3 real recipe cards with "Estimate ~… cal" labels, within ~10–20 s |
| 5 | Get food → Delivery → … → results; tap **Pickup** | iOS asks for location once ("Used once…"); Allow → real nearby places; Delivery/Pickup/Eat nearby switch keeps your answers |
| 6 | Repeat 5 but **Don't Allow** location | message pointing to iPhone Settings → What to Eat → Location; "Get food ideas by type" works |
| 7 | Grab a snack → pick Sweet + Crunchy → Continue | 3 snack cards that fit both |
| 8 | Me → add an allergy (e.g. Peanuts) + Vegetarian → save → back to Make something | no peanuts/meat in any card |
| 9 | Save a recipe → Saved tab → open it; empty state "Find something to make" | opens Cook, not a previous Get-food set |
| 10 | Airplane mode → start a request (or reopen the app) | "You're offline" or "Can't reach the kitchen" with Try again; off airplane mode → Try again works |
| 11 | Home button mid-request, come back | the same request finishes or shows its result |
| 12 | Me → Sign-in methods → **Add** (Apple) | Face ID → "Added" |
| 13 | Sign out → **Sign in with Apple** | the same account (your saved items are there) — not a new one |
| 14 | On a second Apple ID or "Hide My Email": Sign in with Apple | "You're in with a new account" with the choice to use email instead |
| 15 | Me → Delete my account (do this last, on a test account) | asks Apple (for Apple accounts), then back to sign-in; signing in again starts fresh |

Send me anything that doesn't match, with the step number.

## 6. Tester feedback checklist (for TestFlight testers)

1. Could you sign in on the first try? (Apple / email)
2. How long until you saw three options? Did any request fail or hang?
3. Did one of the three fit what you actually wanted to eat? Which one did you pick?
4. Did anything ignore an allergy or diet you set? (Screenshot it.)
5. Pickup / Delivery / Eat nearby: were the places real and open?
6. Anything confusing, cut off, or hard to tap?
7. Did you eat it? (The app asks; please answer there.)

Use TestFlight's built-in feedback (screenshot + shake) or Me → Send feedback.
