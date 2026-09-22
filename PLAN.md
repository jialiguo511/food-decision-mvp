# PLAN.md — Roadmap

What to build next, in order. For *why*, see `PRODUCT.md`. For *how*, see
`CLAUDE.md`.

The whole roadmap serves one goal:

> Context → Recommendation → Selection → Actual eating → Feedback

working end to end. Everything else exists to make that loop work.

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
      recommendation quality in progress. Sends profile + Today context (pantry
      and saved recipes are Extended MVP and not sent). Hard constraints stated
      explicitly; validated JSON; recipes use everyday measures first.
      Currently triggered only by the debug button on Today.
- [~] **Optional daily calorie target** — manually entered on Profile. Needs
      the `schema.sql` migration run, then manual verification. No BMR/TDEE,
      no "Suggest for me".
- [~] **Prompt-level calorie guidance** — calories as a soft energy envelope:
      meal ranges computed from the daily target when set, qualitative goal
      guidance when not. No server-side calorie validator.
- [ ] **Exactly 3 recommendations** — `best_match`, `lowest_effort`,
      `alternative`. Never a longer list.
- [ ] **Select a recommendation** — writes `decision_sessions.chosen_index`.
- [ ] **Record whether it was actually eaten** — writes `meal_feedback`. This
      is the success event the whole product is measured by.
- [ ] **Basic rejection / feedback reason** — why they did not eat it.
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
      boundary: no restaurant APIs, no restaurant discovery, no automatic
      ordering, no menu or price data. This does not change the meaning of
      `PRODUCT.md`'s existing "restaurant ordering / restaurant discovery"
      non-goals — those mean an ordering integration or finding a specific
      nearby restaurant, neither of which this does.
- [ ] **Decision mode: "grab a snack" (`store_snack`)** — added 2026-09-21,
      promoted directly into NOW rather than left at the NEXT-level "Food
      occasion" item, since it is scoped as a third decision mode (not a
      pantry/history feature) and ships no grocery-intelligence surface. A
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

---

## NEXT — the Extended MVP

Useful early extensions. **Do not start these while anything in NOW is
unfinished.** A screen shell existing in the navigation does not promote its
contents into NOW.

- Recipe Inbox / recipe memory
- Simple pantry
- Meal history
- Favorites
- Recent-meal awareness
- Basic preference learning
- "Suggest for me" calorie target — BMR → TDEE → activity → goal adjustment.
  The manual target is already in NOW. Must not turn the product into macro
  tracking. See `PRODUCT.md` → Nutrition target refinement.
- Remaining daily nutrition context — estimated calories and protein left
  today from confirmed-eaten meals; always approximate, never manual logging
- Food occasion — full meal / small meal / snack / dessert
- Measurement-style preference — everyday measures / precise weights / both
- Basic product analytics
- Recruit the first 5–15 external testers

---

## LATER — only after evidence

Parked. These correspond to `PRODUCT.md` → Possible future directions.

- Advanced recipe importing — social ingestion, video extraction, browser and
  share extensions, automatic adaptation of imported recipes
- Personal recipe capture — "I made something I liked", described by text or
  voice, converted into a reviewable structured recipe
- Cook / assemble / buy comparison
- Weekly meal planning
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
None of this is scheduled. Nothing here is authorized to build until a piece
of it is explicitly promoted into NOW or NEXT above — same rule as every
other LATER item.

**POST-MVP / V1.5 — location-aware "Near me"**
- Browser location permission, requested only on an explicit "Near me" tap,
  used temporarily rather than stored by default
- Nearby-place discovery via a places/location provider (e.g. Google Places
  or equivalent)
- Nearby restaurants and nearby grocery/convenience stores
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

**Prioritization principle:** do not build a technically impressive
integration before validating the core behavior. The current core question is
still "does Nutrition Coach meaningfully improve real food decisions?" (see
`PRODUCT.md` → Current hypothesis). External APIs should increase
actionability *after* that is validated, not substitute for validating it.
Location-awareness is the most likely first one, since it moves
recommendations from "what could you eat" to "what can you realistically eat
or buy around you right now" without requiring full delivery-marketplace
integration.

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
   ├── Server Actions     → writes (save profile, save pantry item, record feedback)
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
| `pantry_items` | what's in the kitchen | name + coarse category only, no quantities |
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
