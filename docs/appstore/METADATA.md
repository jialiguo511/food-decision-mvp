# App Store / TestFlight metadata — draft for v1.0 (edit freely; you own every answer)

## Identity
| field | value |
|---|---|
| App name (≤ 30) | What Should I Eat? — check availability in App Store Connect; fallback "What Should I Eat – Meals" |
| Home-screen name | What to Eat (`capacitor.config.ts` appName, Info.plist `CFBundleDisplayName`) |
| Subtitle (≤ 30) | Three meal ideas, right now |
| Bundle ID | your choice, permanent — see TESTFLIGHT.md §2 (placeholder `com.whatshouldieat.app`) |
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
- Privacy policy: `https://<production>/about` (must describe the processors below and Sign in with Apple once enabled)
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

## App Privacy ("nutrition label") — my reading of the code
| data type | collected | linked to user | tracking | purpose |
|---|---|---|---|---|
| Email address | yes | yes | no | App functionality (sign-in) |
| Health & fitness (optional: age, sex, height, weight, activity, goal) | yes, if entered | yes | no | App functionality |
| Other user content (food preferences, allergies, diet, saved recipes/places, "did you eat it") | yes | yes | no | App functionality |
| Product interaction (named events with fixed values) | yes | yes | no | Analytics |
| Precise location | sent for one nearby search, **not stored** — Apple's definition excludes data not retained; confirm before answering "not collected" | — | no | App functionality |
| User ID | yes | yes | no | App functionality |
No ads, no third-party tracking SDKs, no data sold.

Processors to name in the privacy policy: Supabase (auth, database), Vercel (hosting), Anthropic
(the request and preferences), Google Places (location for one search), OpenAI and Pexels (dish
descriptions for pictures), Cloudflare Turnstile (bot check), Apple (Sign in with Apple, later).

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
