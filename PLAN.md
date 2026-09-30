# PLAN.md — Roadmap

What to build next, in order. For *why*, see `PRODUCT.md`. For *how*, see
`CLAUDE.md`.

The whole roadmap serves one goal:

> Context → Recommendation → Selection → Actual eating → Feedback

working end to end. Everything else exists to make that loop work.

## How to read this file

| section | meaning | authorizes building? |
|---|---|---|
| **NOW** | Core-loop MVP. Required before the hypothesis can be tested. | Yes |
| **NEXT** | Extended MVP. Build only once NOW works end to end. | Yes, after NOW |
| **LATER** | Parked, with a plausible path. Needs promotion and evidence first. | **No** |
| **NOT NOW** | Excluded — by product identity or by current phase. | **No** |

**This file holds status only.** Product rules are defined once, in
`PRODUCT.md` — the decision priority order, hard vs. soft constraints, the
exactly-3 rule, external integrations, the guardrails, and preferred
terminology — and are referred to from here, not restated. Personalization rules
are in `PERSONALIZATION.md`.

Documentation alignment, 2026-09-29 (three passes, no code): the product is a
context-aware food decision assistant ("help me decide what to eat right now")
with three action domains — **Cook**, **Eat out**, **Stock up** — that are
different ways of solving one problem, not separate products. Nearby
restaurant/café discovery was promoted to NEXT; remaining-nutrition context
moved to LATER; hard dietary constraints added to NOW as a foundation item.

---

## Done — verified 2026-09-11

Confirmed working against a live Supabase project, not just written:

- [x] Project scaffold (Next.js App Router, TypeScript, Tailwind v4)
- [x] Supabase connection from Server Components and Server Actions
- [x] Database schema — five tables
- [x] Authentication — magic link, with session refresh in middleware
- [x] Row Level Security — anon denied on all five tables
- [x] **My Food Profile** — full read/write
- [x] Profile persistence across reload, row confirmed in `profiles`
- [x] `npm run typecheck` and `npm run lint` clean

One fix came out of that verification: `schema.sql` enabled RLS and created
policies but never granted table privileges. RLS and GRANTs are separate gates
in Postgres — newer Supabase projects ship no blanket privileges on `public`,
so every query failed with `42501` before any policy ran. The file now grants
to `authenticated` only, since every page calls `requireUser()` and nothing is
ever read as `anon`.

---

## Done — Stage 1 navigation/IA refactor, 2026-09-22

Architecture and documentation only — no changes to `/api/recommend`, the
recommendation prompt, `MealContext`, the Today/Cook form logic, session
restore, regenerate, recipe persistence, or the database schema.

- [x] `CLAUDE.md` / `PRODUCT.md` updated: the old five-screen structure
      (Today / Results / My Food / Inbox / Profile) is replaced by four
      top-level areas — **Home / Plan / Groceries / Me** — and a new explicit
      product principle ("minimum decisions possible, progressive disclosure")
      is documented in both files.
- [x] `BottomNav` now shows Home / Plan / Groceries / Me. Internal routes are
      unchanged: Home is still served by `/today`, Me by `/profile`.
- [x] New minimal placeholder pages: `/plan` and `/groceries`, styled with the
      existing `ComingNext` component — no new components, no functionality.
- [x] Removed `/my-food` and `/inbox`, which were empty placeholder stubs with
      no functionality and no incoming links once the nav changed. Their
      future content is not dropped from scope — see `CLAUDE.md` and
      `PRODUCT.md` for where it now conceptually belongs (Plan, Groceries,
      Me) — this only removed dead placeholder routes.
- [x] Also removed `/results`, discovered during the build check: an orphaned
      placeholder route never linked from `BottomNav`, superseded by
      `RecommendationResults` rendering inline within `/today`/Home. Same
      "dead stub, no functionality" reasoning as `/my-food` and `/inbox`.
- [x] `/today` page header now reads "Home" instead of "Today" so it matches
      the nav tab that links to it; no other page content changed.

Not done in this stage, on purpose: the Cook / Plan ahead / Eat out entry
screen on Home, the CookForm step-by-step split, the $0 budget / "use only
what I have" change, and any real Plan or Groceries functionality. All
require explicit approval before starting — see NOW below.

---

## NOW — the Core-loop MVP

Everything required before the product hypothesis can be tested at all. See
`PRODUCT.md` for what each item means. Nothing here is optional — the product
is unvalidated until the whole loop runs end to end:

```
Context → Recommendation → Selection → Actual eating → Feedback
```

- [x] **Food Profile** — implementation complete, verified 2026-09-11
- [~] **Today context page** — implementation complete; founder UX review
      pending. `Find my meal` currently renders the captured `MealContext`
      for inspection instead of calling anything.
- [~] **`/api/recommend`** — implementation complete; founder review of real
      recommendation quality in progress. Sends profile + Today context,
      including Kitchen staples (saved recipes are Extended MVP and not
      sent). Hard constraints stated explicitly; validated JSON; recipes use
      everyday measures first. Currently triggered only by the debug button
      on Today.
- [x] **Kitchen staples (Me) + "What do you have right now?" (Today)** —
      added 2026-09-28, replacing the earlier general-purpose "pantry"
      concept, which mixed persistent condiments with actual, perishable food
      and went stale. See `CLAUDE.md` → "Kitchen staples vs. today's food"
      for the canonical availability rule and why it's built this way.
      "Use what I have" is strict: only `todaysFoods + kitchenStaples` (plus
      water) may appear in a recommendation, validated server-side, not just
      prompted for; it returns 0–3 recommendations rather than inventing a
      missing ingredient to reach three; and not having enough to make a real
      meal surfaces the "Show me what to buy" fallback (the existing
      "I can buy a few things" flow, optimized for the fewest additional
      items) instead of a forced recipe.
- [~] **Optional daily calorie target** (legacy label; the docs' concept is
      *estimated daily energy range*) — manually entered on Profile. Needs the
      `schema.sql` migration run, then manual verification. No BMR/TDEE, no
      "Suggest for me".
- [~] **Prompt-level calorie guidance** — calories as a soft energy envelope:
      meal ranges computed from the daily target when set, qualitative goal
      guidance when not. No server-side calorie validator.
- [ ] **Exactly 3 recommendations** — `best_match`, `lowest_effort`,
      `alternative`. Never a longer list. The rule — including that it applies
      to decisions, not execution artifacts, and that truth beats three — is
      defined in `PRODUCT.md` → "Exactly 3." "Use what I have" returning 0–3 is
      an instance of it (see Kitchen staples above).
- [ ] **Hard dietary constraints (foundation)** — added 2026-09-29. A small
      prerequisite, not a feature: proper support for allergies, dietary
      restrictions, and other safety-related food exclusions, kept distinct
      from *disliked foods* (which are soft preferences). Hard constraints must
      be respected by **every** recommendation mode, never overridden by
      behavioral inference, and never relaxed to reach three options. The
      product makes no "safe" / "allergen-free" claims. Today the Profile has
      only *disliked foods* (which the prompt currently treats as hard
      exclusions), so this needs a Profile field and a data-model change and a
      prompt/validation change — **none of which is implemented yet**; how to
      enforce it is decided by the implementing task. It must land before
      Eat out — nearby and before richer personalization. Definition:
      `PRODUCT.md` → "Hard constraints vs. soft preferences."
- [ ] **Select a recommendation** — writes `decision_sessions.chosen_index`.
      (With the two items below, this is also the data foundation
      personalization later reads — see `PERSONALIZATION.md`.)
- [ ] **Record whether it was actually eaten** — writes `meal_feedback`. This
      is the success event the whole product is measured by.
- [ ] **Basic rejection / feedback reason** — why they did not eat it.
      Should distinguish context reasons from taste reasons (see
      `PERSONALIZATION.md`).
- [ ] **Decision mode: "I can cook" / "I want to order food"** — added
      2026-09-14. A first-level choice on Today, before the rest of the
      context. "I can cook" is the existing flow above, unchanged. "I want to
      order food" is a lightweight alternative for when cooking isn't
      happening tonight: hunger, a craving category, and delivery / pickup /
      eat nearby, reusing goal/protein/dislikes from the profile. Recommends
      three meal *categories* — what to search for in a delivery app, a
      suggested order, why it fits — not recipes. See `PRODUCT.md` → "Three
      decision modes" for the coaching philosophy (harm reduction, no
      moralizing language, no reflexive calorie restriction) and the explicit
      boundary of *this category mode*: no restaurant APIs, no restaurant
      discovery, no automatic ordering, no menu or price data. Nearby
      discovery is a separate NEXT capability inside the Eat out umbrella.
- [ ] **Decision mode: "grab a snack" (`store_snack`)** — added 2026-09-21,
      promoted directly into NOW rather than left at the NEXT-level "Meal
      context" item, since it is scoped as a third decision mode (not a
      history feature) and ships no grocery-intelligence surface. A
      third first-level choice on Today for "I want something sweet/salty
      right now and am willing to walk into a store, but not cook or order a
      meal." Asks only hunger and a one-tap craving type (sweet / salty /
      crunchy / creamy / anything), reusing goal/protein/dislikes from the
      profile. Recommends three specific, ready-to-buy grocery/convenience
      items — not recipes, not delivery search terms — with a `what_to_look_for`
      field guiding what to look for in the store. No store inventory,
      location, pricing, or product-database integration: those remain out of
      scope per `CLAUDE.md`'s non-goals and `PRODUCT.md`'s "Grocery
      intelligence" future direction.
- [ ] **Founder self-use for at least 7 days** — Stage 1 in `PRODUCT.md`. A
      real roadmap item, not an afterthought. Shipping the rest without it
      proves nothing.

**Direction check, 2026-09-29.** One small item was added to NOW — hard
dietary constraints, above. Everything else in the direction is already
covered: *cook from what I have / buy a few missing ingredients* (Kitchen
staples and the `shopping` modes), *Eat out as meal categories* (the "order
food" mode), *lightweight energy/protein guidance as context* (the manual
target and prompt-level guidance), and *explicit memory* (the Food Profile).
Stabilizing the current Cook/Kitchen-staples flow and finishing the loop
(select → eaten → reason) remain the priorities.

---

## NEXT — the Extended MVP

Useful early extensions. **Do not start these while anything in NOW is
unfinished.** A screen shell existing in the navigation does not promote its
contents into NOW.

- Saved recipes (legacy label: "Recipe Inbox" / recipe memory)
- Recent meals — recent choices for repetition awareness and context; not a
  food diary
- Favorites
- Basic preference learning — rules-based, soft ranking only: repeat/recency
  and what the user actually ate. Must follow the rules in
  `PERSONALIZATION.md`: one choice is not a preference, non-selection is not
  dislike, explicit constraints are never overridden. No ML model, no vector
  store. Learned/inferred memory must ship together with a way to see and
  reset it.
- **Routine defaults (v0, user-set)** — added 2026-09-29. Pre-selected
  defaults on Home for weekday lunch, weekday dinner, and weekend (mode lean,
  time, effort, budget feel), set explicitly by the user — e.g. "make this my
  usual." A hypothesis that these contexts differ enough to save decisions;
  validate on founder self-use before extending. Overridable in one tap,
  never a hidden constraint. Inferred routines are LATER.
- **Last-used chip defaults (smart defaults v0)** — built 2026-09-29,
  unvalidated (a hypothesis that last use predicts this use). Home opens with
  each mode's chips on that mode's most recent values — Cook: hunger, effort,
  budget override; Order: hunger, method, meal budget, and the Eat nearby
  travel answer — instead of hard defaults. Stored nowhere new: derived on
  each visit from the last 30 `decision_sessions.context` rows, so it updates
  only when a "Find my meal" succeeds, survives refresh / new browser /
  device, and a new user gets the plain defaults. Defaults only — every chip
  stays editable — and never carried: cravings, "what do you have right now"
  foods, "Use what I have", cook minutes (stays the Profile default). It does
  not change Profile fields or ranking. Kept distinct from the *decision
  session* (one eating decision's temporary state): the latest session
  auto-restores on open only if its `created_at` is within 6 hours — older
  rows stay as history but restore nothing, so stale recommendations, foods
  on hand and cravings never reappear, while the defaults above still apply.
  No separate "use my usual" button:
  the pre-selected "Find my meal" is that path. Not the user-set routine
  defaults item below, which is still unbuilt.
- **Eat out — nearby (restaurant/café discovery + contextual ranking)** —
  promoted from LATER 2026-09-29; "Nearby Eat out v1." A core extension of
  "help me decide what to eat right now": users who normally eat out get
  useful recommendations without being forced into Cook. It lives **inside the
  Eat out umbrella** ("Find food near me" beside category guidance) — **not a
  new Home intent** (see `PRODUCT.md` → "Home structure"). Scope, exclusions,
  provider requirements (small provider boundary, narrow fields, observable
  cost, no dependence on expensive metadata; planned provider Google Places API
  (New), *not implemented or configured*), and privacy are defined once in
  `PRODUCT.md` → "Eat out — nearby"; not restated here. **Depends on:** NOW
  hard dietary constraints. The existing category-based "order food" mode is
  unchanged.
  **Status, 2026-09-29: first vertical slice built, unvalidated, not yet run
  against a live Google key.** Started at the founder's explicit request while
  NOW was still unfinished and while the hard-dietary-constraints foundation
  did not exist — so nearby has **no hard constraints yet**: Profile *disliked
  foods* are used as a soft, strong negative ranking signal (per `PRODUCT.md`,
  a dislike is not an allergy or restriction), and it makes no allergy/safety
  claim. The existing Cook/order/snack prompts still treat dislikes as hard
  exclusions — that pre-existing gap is untouched. This does not replace that
  NOW item. Built: "Find food near me" inside Order mode (geolocation only on
  tap, never stored); Google Places API (New) Nearby Search behind a provider
  interface (`src/lib/places/`); the existing recommender picks up to three
  from that request's real candidates by `place_id`, validated against them;
  each card links to the place in Google Maps; persisted in the existing
  `decision_sessions` (no schema change). Not built: everything under "Not
  part of this slice", personalization of nearby ranking, routing/walking
  times, a radius setting. Setup: `README.md` → "Nearby places (Google Places
  API)".
- **Nutrition baseline** — estimated daily energy range + protein target/range
  (replaces the old "Suggest for me" item). **Requires Profile inputs the
  product does not collect today** — age, height, weight, the physiological
  input the chosen validated equation needs (if any), activity level, goal —
  so adding those optional inputs is part of this item, and it does not start
  before they exist. No estimate is fabricated when inputs are missing. The
  calculation method is chosen and documented at implementation, not now.
  Carbohydrate and fat targets are **not** part of NEXT. Must not turn the
  product into macro tracking. See `PRODUCT.md` → "Nutrition target
  refinement."
- Meal context — breakfast / lunch / dinner / snack / dessert, or the current eating situation
- Measurement-style preference — everyday measures / precise weights / both
- Basic product analytics
- Recruit the first 5–15 external testers
- **Recipe visualization** (legacy label; "option images" if extended beyond Cook) — added 2026-09-28. Recipe cards should show an
  image to help "do I want to eat this?" decide faster, but a recommendation
  must never depend on image generation or lookup succeeding — the core loop
  wins per `CLAUDE.md`. Cook-only for now: order and store-snack recommendations
  aren't given an `image_query` yet, since they'll likely need a different
  image source (a menu photo, a product photo) rather than sharing Cook's
  dish-photo contract. First slice (done): `image_query` (dish + key
  ingredients, e.g. "chicken spinach rice bowl" — never a URL from the model)
  added to Cook's structured output and persisted verbatim in
  `decision_sessions.recommendations`; a swappable `ImageProvider` interface
  in `src/lib/images/provider.ts` with a no-op stub. No UI renders an image
  yet — a permanent placeholder-only image box is explicitly not wanted; the
  image area on recommendation cards (large for `best_match`, thumbnail for
  the other two) only ships once a real provider is chosen and can return
  useful images. Choosing that provider (stock/search, curated library, AI
  generation) is a separate decision, not yet made.

---

## LATER — only after evidence

Parked. These correspond to `PRODUCT.md` → Possible future directions.

- Advanced recipe importing — social ingestion, video extraction, browser and
  share extensions, automatic adaptation of imported recipes
- Personal recipe capture — "I made something I liked", described by text or
  voice, converted into a reviewable structured recipe
- Cook / assemble / buy comparison
- **Stock up — "Stock me for N days"** — added 2026-09-29. The third action
  domain. Flexible provisioning for the next few days — not meal planning:
  **one** grocery basket (an execution artifact), no per-day schedule, no
  persisted pantry. Builds on the Groceries container and store-agnostic
  grocery lists (Level A, below); do not start before either has real
  contents. The live "Plan" label / "Plan ahead" intent may be renamed "Stock
  up" — documentation-only for now (`PRODUCT.md` → "Terminology"). See
  `PRODUCT.md` → "Stock up."
- **Approximate recent-intake context** (formerly "remaining daily nutrition
  context") — moved from NEXT 2026-09-29. Needs reliable intake/feedback data
  and risks drifting toward calorie tracking; if retained, it is optional,
  approximate recommendation context — never "calories remaining," never a
  required logging system. Promotion needs evidence in `LEARNINGS.md`.
- Carbohydrate / fat estimates — a possible later, advanced detail only; not a
  current product priority and not in NEXT.
- **Behavioral learning and deeper personalization** — added 2026-09-29.
  Inferred routines, inferred-preference confirmation ("make this a
  favorite?"), and any learning beyond the NEXT basics (recent meals,
  basic preference learning). Requires those basics to exist and show value
  first. See `PERSONALIZATION.md`.
- Native mobile app
- Household mode
- Subscriptions

The **location-aware recommendation roadmap** below is its own staged group,
broken out separately because it is currently the most likely next major
direction and spans several future versions, not one flat item.

> **LATER items are not promises.** An idea listed only in `PRODUCT.md` Future
> Directions may not be built. It must first be explicitly promoted into NOW
> or NEXT in this file. Record the evidence that justifies a promotion in
> `LEARNINGS.md`.

### Location-aware recommendation roadmap

Staged order for the biggest future direction — see `PRODUCT.md` →
"Location-aware recommendations" for the full rationale, the conceptual
architecture, the ranking-engine notes, and the key technical challenges.
Except for the slice already promoted into NEXT ("Eat out — nearby"), none of
this is scheduled. Nothing here is authorized to build until a piece of it is
explicitly promoted into NOW or NEXT above — same rule as every other LATER
item.

**V1.5 — location-aware "Near me"**

*Restaurants and cafés were promoted to NEXT on 2026-09-29 — see "Eat out —
nearby" in NEXT above; the location and place-discovery groundwork is part of
that item.* What stays LATER from this stage:
- Nearby **grocery and convenience stores** — same place layer, separate
  promotion
- **Recipe → missing ingredients → nearby grocery store** — a recipe's one
  missing-ingredient list paired with nearby stores, store-agnostic (names
  where to go, not what is in stock or its price)
- Recommendations framed around nearby place *categories* — not menus, not
  inventory. Does not depend on DoorDash/Uber Eats access.

**V2 — restaurant-specific recommendations**
- User selects one real nearby restaurant
- Curated/manually-maintained menu data for common, high-frequency chains
  (data acquisition strategy A/B in `PRODUCT.md`)
- What to order, one modification, an approximate calorie/protein range, and
  why — the Order Food coaching philosophy applied to a real menu
- Store-agnostic grocery lists (grocery Level A in `PRODUCT.md`) — lower
  difficulty, no inventory or SKU-level data required

**V2.5 / V3 — broader retrieval and ranking**
- Broader restaurant menu ingestion beyond curated chains
- A structured ranking engine (distance, price, craving/goal fit, prior
  feedback) starting to replace pure prompt-based selection
- Personalized ranking from historical feedback
- Store-specific grocery products (grocery Level B in `PRODUCT.md`) —
  requires retailer/catalog/inventory APIs

**LATER / partnerships**
- DoorDash / Uber Eats integration, only if and when partnership or approved
  API access exists — never assumed as available
- Instacart / retailer catalog integrations
- Deep-link or order-handoff into delivery apps
- Live prices/inventory, only where officially supported

**Prioritization principle:** external integrations follow the rule in
`PRODUCT.md` → "External integrations" (necessary to test a core hypothesis;
narrow, replaceable, cost-controlled) — not the older, absolute "no external
APIs before validation." Nearby Eat out qualified; the LATER integrations above
do not yet.

---

## NOT NOW — excluded

Not LATER. LATER items have a plausible path once evidence exists; these do
not, for one of two reasons. Neither is permission to build.

### Excluded by product identity

Not this product; changing any means changing `PRODUCT.md` first. Defined once
in `PRODUCT.md` → "Product identity and guardrails":

- **Calorie logging and macro diary** — including any "calories remaining"
  balance the user must manage
- **Rigid or fixed weekly meal planning** — Stock up (LATER) serves the real
  need
- **Heavy recommendation browsing / recipe database** — three choices when
  deciding, not a feed
- **Generic "AI nutrition coach"** — no open-ended chat, no unsolicited advice
- **Social feed or community features**

### Excluded by current phase

May become LATER items with evidence. Full list: `PRODUCT.md` → Current
non-goals. Most likely to be mistaken for in-scope work:

- Everything outside the "Eat out — nearby" slice, as listed under "Not part of
  this slice" in `PRODUCT.md`: full restaurant menus, delivery marketplace,
  restaurant ordering, reservations, reviews
- Grocery checkout, pricing, store inventory, Instacart, and grocery delivery
  integrations
- Carbohydrate / fat targets as a product feature; manual calorie or macro
  logging
- Any inferred (non-explicit) memory shipped without a way to view and reset
  it; any trained recommendation model or vector database

---

## Reference — architecture

One Next.js app. No separate backend, no queues, no workers, no ORM.

```
Browser (React Server Components + a few client components)
   │
   │  form posts / fetch
   ▼
Next.js App Router (Vercel)
   ├── Server Components  → read data directly from Supabase with the user's session
   ├── Server Actions     → writes (save profile, save kitchen staple, record feedback)
   └── Route Handlers     → /api/recommend  (the only place the LLM key is used)
   │
   ▼
Supabase (Postgres + Auth + Row Level Security)
```

Three decisions worth knowing:

1. **Row Level Security is the authorization layer.** Every table has a
   `user_id` and a policy saying "you can only touch rows where
   `user_id = auth.uid()`". We never write `WHERE user_id = ...` by hand and
   hope we remembered. Postgres enforces it. Note that RLS only filters rows
   *after* a GRANT lets the role touch the table at all — both gates are
   required.
2. **Server Actions for writes, Route Handler for the LLM.** Server Actions
   are the simplest way to do a form post in the App Router. The one exception
   is `/api/recommend`, a real route handler because it is a long-ish call
   returning JSON the client renders.
3. **The LLM never runs in the browser.** The provider key lives only in
   `.env.local` / Vercel env vars without a `NEXT_PUBLIC_` prefix, so Next.js
   refuses to bundle it into client code.

## Reference — data model

Five tables, plus Supabase's built-in `auth.users`.

| table | holds | shape note |
|---|---|---|
| `profiles` | persistent preferences | scalars as columns, lists as JSONB |
| `kitchen_staples` | persistent condiments/seasonings only — never actual food | name only, no quantities |
| `recipes` | Recipe Inbox | raw text/URL + optional LLM-structured JSONB |
| `decision_sessions` | one "Find my meal" event | context JSONB + the 3 recs JSONB, either mode |
| `meal_feedback` | did they actually eat it | links back to a session |

Lists (cuisines, dislikes, equipment) are JSONB rather than join tables. They
are read and written as a whole, never queried across users, so a normalized
table would add migrations and joins and buy us nothing.

`decision_sessions.context` and `.recommendations` carry a `decision_mode:
"cook" | "order" | "store_snack"` field inside the JSONB. Adding the order
and store_snack modes required no migration — the shape of "one context in,
three recommendations out" already lived in flexible JSONB columns, only the
TypeScript/Zod types on top of it became a discriminated union.

Nutrition is **estimates stored alongside each recommendation**, not a
nutrition database. We are not building a calorie tracker.
