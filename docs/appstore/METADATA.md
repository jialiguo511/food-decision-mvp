# App Store / TestFlight metadata — draft for v1.0 (edit freely; you own every answer)

## Identity
| field | value |
|---|---|
| App name (≤ 30) | What Should I Eat? — check availability in App Store Connect; fallback "What Should I Eat – Meals" |
| Home-screen name | What to Eat (`capacitor.config.ts` appName, Info.plist `CFBundleDisplayName`) |
| Subtitle (≤ 30) | Three meal ideas, right now |
| Bundle ID | your choice, permanent — see TESTFLIGHT.md §2 (placeholder `com.jialiguo.whatshouldieat`) |
| Version / build | 1.0.0 (1) — `ios/app-version.json`, Xcode MARKETING_VERSION / build number |
| Primary category | Food & Drink |
| Secondary | (none, or Lifestyle) — avoid Health & Fitness/Medical to keep review away from health claims |
| Age rating | 4+ (no objectionable content; no unrestricted web access — external sites open in Safari) |
| Price | Free, no in-app purchases |

## Description (≤ 4000)
Can't decide what to eat? Tell us what's going on — how hungry you are, how much time you have,
whether you want to cook — and get three ideas that fit, in seconds.

• Make something: recipes from what you have, or with a few things to buy.
• Get food: delivery ideas to search for, or real places nearby for pickup or eating in.
• Grab a snack: something quick from a store, sweet, salty, crunchy or all three.

It remembers what you never eat — allergies and diets are always left out — and what you can cook
with, so you answer less each time. Save recipes and places to come back to.

Nutrition numbers are estimates for a typical portion, not measurements. Suggestions can miss
allergens: always check ingredients yourself.

## Promotional text (≤ 170)
Three ideas for your next meal — cook, get food or grab a snack — fitted to your allergies, diet,
time and budget.

## Keywords (≤ 100, comma-separated)
meal ideas,what to eat,dinner,recipes,food decision,quick meals,vegetarian,allergy,takeout,snack

## URLs
- Privacy policy: `https://food-decision-mvp.vercel.app/about` — the updated text is on `feat/ios-app`; it reaches this URL only when production is updated (your approval)
- Support: `https://<production>/feedback` (needs sign-in — add a support email to App Store Connect too)
- Marketing (optional): `https://<production>/demo`

## Screenshots (6.9", 1320 × 2868 — `docs/appstore/screenshots/`)
Taken from a real signed-in session on the iPhone 18 Pro Max Simulator against the Preview backend
(test account, deleted afterwards), status bar normalised to 9:41.
1. `01-home.png` — Home: one sentence or three ways
2. `02-get-food.png` — Get food · Delivery ideas with the Delivery / Pickup / Eat nearby switch
3. `03-nearby.png` — Eat nearby: real places with Google photos
4. `04-cook.png` — Cook: recipe cards with estimate labels
5. `05-snack.png` — Snack: Salty + Crunchy
6. `06-saved.png` / `07-me.png` — Saved, Me
Remove "Public Beta" from screenshots for the App Store listing (see risks); fine for TestFlight.

## App Privacy ("nutrition label") — corrected 2026-11-24

Apple counts data as "collected" when it leaves the device and can be accessed by you **or a
third-party partner** beyond the moment of the request. Third parties (Anthropic, Google) receive
some of it, so the conservative answers are:

| Apple category | collected | linked to user | tracking | purpose | what it is |
|---|---|---|---|---|---|
| Contact Info → Email Address | yes | yes | no | App Functionality | sign-in (Supabase, Resend) |
| Health & Fitness → Health | yes (only if entered) | yes | no | App Functionality | optional age, sex, height, weight, activity, goal, calorie/protein targets |
| Location → Precise Location | **yes** | **no** | no | App Functionality | coordinates sent to Google Places for one nearby search; not stored by us |
| User Content → Other User Content | yes | yes | no | App Functionality | allergies, diet, foods avoided, equipment, staples, request answers, saved items, "did you eat it", feedback messages |
| User Content → Other User Content (typed sentence) | yes | no | no | App Functionality | sent to Anthropic to read it; not stored by us |
| Identifiers → User ID | yes | yes | no | App Functionality | account id |
| Usage Data → Product Interaction | yes | yes | no | Analytics | named events with fixed values only |

Not collected: financial info, contacts, browsing history, search history, diagnostics/crash data,
photos, audio, purchases, sensitive info. No tracking, no ads, no data sold.

The earlier draft answered location "not collected"; that relied on our server not storing it, but
Google receives it, so declare it. Same for the typed sentence (Anthropic).

Third parties to name in the privacy policy (all named in `/about` as of this branch): Supabase,
Vercel, Resend, Anthropic, Google Maps Platform, OpenAI, Pexels, Cloudflare Turnstile; Apple once
Sign in with Apple is turned on.

## Review notes (App Review / Beta App Review)
- Sign in: email + one-time code. Provide a reviewer address you can read and forward codes from,
  or enable Sign in with Apple before review. (Codes expire in 10 minutes.)
- A one-second bot check opens in a secure sheet before the code is sent.
- Location is asked only after tapping "Find food nearby"; denying it leaves "food ideas by type".
- Account deletion: Me → Account & data → Delete my account.
- The app needs a network connection for suggestions; without one it shows an offline screen.

## TestFlight "What to Test"
Sign in with your email code, then try one of each: Make something, Get food (switch Delivery /
Pickup / Eat nearby), Grab a snack. Save something, find it in Saved. Set an allergy in Me and check
it's left out. Tell us: did one of the three ideas fit? Anything slow, confusing, or wrong?
Feedback: screenshot + share in TestFlight, or Me → Send feedback.
