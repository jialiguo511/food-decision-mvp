# CLAUDE.md — Food Decision MVP

Context for any future Claude Code session in this repo. Read this before
writing code.

## What this product is

A tool for **food decision fatigue**. It answers one question:

> "What should I actually eat right now, given my real-life constraints?"

It is **not** a recipe app and **not** a calorie tracker. Success is measured
by whether the user actually ate one of the three suggestions — not by
nutritional precision, not by recipe library size.

## The core loop (protect this above all else)

```
Today → enter current context → "Find my meal"
      → backend returns exactly 3 recommendations
      → user picks one
      → later records whether they actually ate it
      → feedback is stored
```

If a change does not make this loop more likely to complete, it is out of
scope for now.

### Strategic direction, for implementers

Defined in `PRODUCT.md` → "Strategy — the wedge and the long-term product"; not
restated here. What it means when writing code:

- **The wedge is built; the long-term product is a hypothesis.** The wedge is
  fast next-meal decision support. The long-term idea — a system that learns how
  one person eats, so each decision improves the next — is *not* built beyond the
  explicit layer and a minimal behavioral slice. Never write UI, prompts, types,
  or docs that speak of it as if it exists.
- **Every feature should either use stored context or leave a usable signal** —
  or reduce what the user has to answer. A feature that only adds questions works
  against the strategy ("the more you use it, the less you should have to explain
  yourself").
- **A new Profile field or stored signal must name the recommendation behavior it
  changes** (`PRODUCT.md` principle 9). `PERSONALIZATION.md` lists what each
  field does today.
- **Success is time-to-decision, not time-in-app.** Do not add engagement
  mechanics, streaks, or anything that rewards staying in the app.
- **Cook / Eat out / Snack are interaction modes over one decision system**, not
  separate products. Learning stays scoped per mode until shown to generalize.
- **Say "Kitchen staples" and "today's food", never "pantry".** There is no
  persisted inventory; see "Kitchen staples vs. today's food."
- **"Personal model" means rules, not a trained model.** No recommendation ML or
  vector database without first changing `PRODUCT.md`.
- **The four strategic stages in `PLAN.md` promote nothing.** NOW / NEXT / LATER
  still decides what may be built.

## Product decision rules

### Document authority

Read these before making any product change. When they disagree, the higher
one wins:

1. **`PRODUCT.md`** — why the product exists, product principles, scope
   definitions
2. **`PLAN.md`** — what we are actually building now / next
3. **`PERSONALIZATION.md`** — how the product remembers and learns about a
   user (design intent; authorizes nothing not promoted in `PLAN.md`)
4. **`LEARNINGS.md`** — evidence that may change our assumptions
5. **`CLAUDE.md`** — rules for implementing the product

Two gating rules follow from that order:

- **If a future idea appears in `PRODUCT.md` but not in `PLAN.md`, do not build
  it.** An idea listed only under Possible future directions must first be
  explicitly promoted into `PLAN.md` NOW or NEXT. This is the rule that stops
  feature creep.
- **If implementation contradicts `PRODUCT.md` or `PLAN.md`, flag the conflict
  before proceeding.** Do not quietly resolve it in code.

### Rules

- **Do not implement `LATER` ideas** from `PLAN.md` unless explicitly asked.
- **Do not silently add features.** If something seems missing, say so; do not
  build it uninvited.
- **Optimize for the smallest implementation that validates the next
  hypothesis.** Not the most general one, and not the most complete one.
- **Preserve "exactly 3 recommendations"** unless explicitly told to change it.
  It is a product principle, not a default value; its full definition —
  decisions vs. execution artifacts, and truth beating three — is in
  `PRODUCT.md` → "Exactly 3."
- **Never treat a NEXT or LATER item as built.** Do not write UI, prompts,
  types, or docs that speak of one as if it exists.
- **Prefer low-friction UI over configurability.** A setting is a decision
  pushed onto the user, and this product exists to remove decisions.
- **Prefer shipping a working vertical slice** over adding infrastructure that
  nothing uses yet.
- **When a feature idea conflicts with the core loop, the core loop wins.**

Keep three things clearly separated, in code comments, docs, and conversation:

| | meaning |
|---|---|
| **Validated behavior** | We have evidence users actually do this |
| **Current hypothesis** | We believe it; it is not yet proven |
| **Possible future idea** | Parked. Not scheduled, not promised |

Do not describe a hypothesis as if it were validated. Record evidence that
changes any of these in `LEARNINGS.md`.

**When asked to implement a meaningful product feature, briefly state the
implementation plan before editing code.** A few sentences is enough — enough
for the reader to redirect you before the work exists, not after.

### Two MVP layers

`PRODUCT.md` defines both. `PLAN.md` says which one we are in.

- **Core-loop MVP** — Food Profile · Today context · exactly 3 recommendations
  · select a recommendation · record whether it was actually eaten · basic
  rejection / feedback reason. Required before the product hypothesis can be
  tested at all.
- **Extended MVP** — saved recipes · recent meals · favorites · basic
  preference learning · routine defaults · Eat out — nearby · nutrition
  baseline. Useful, but build only after the core loop works end to end.
  (`PLAN.md` has the authoritative list.)

## Identity, guardrails, and where the rules live

The product is a **context-aware food decision assistant**; its one job is
"help me decide what to eat right now." It has three action domains — **Cook**,
**Eat out**, **Stock up** — that are different ways of solving one problem, not
separate products.

**Each product rule is defined once, in `PRODUCT.md`.** This file does not
restate them; read them there:

| rule | `PRODUCT.md` section |
|---|---|
| what the product must not become (calorie tracker / macro diary, rigid meal planner, recipe database, generic AI nutrition coach) | Product identity and guardrails |
| recommendation priority order | Product principles → Decision priority order |
| hard constraints vs. soft preferences | Product principles → Hard constraints vs. soft preferences |
| exactly 3 (decisions vs. execution artifacts; truth beats three) | Product principles → Exactly 3 |
| external integrations | Product principles → External integrations |
| preferred vs. legacy terminology | Terminology and legacy labels |
| Home structure (Cook / Eat out umbrella) | Three action domains |

If a change pushes toward one of the four guardrail items, flag it rather than
building it. New features must not reorder the priority order.

**Terminology in code.** Some labels are hard-coded and are legacy, not
positioning — for example the "Plan" nav tab (now unlinked) and the "daily
calorie target" Profile field. Do not rename them in passing; a rename is its
own promoted task. **The app's public name lives in one place,
`src/lib/brand.ts`** (tab title, manifest, home-screen label, sign-in page, About) —
it replaced three inconsistent names, including the legacy "Nutrition Coach",
which contradicted the guardrail against being a nutrition coach. The current name
is a placeholder; change it there, nowhere else.

## Personalization rules

Full rules in `PERSONALIZATION.md`. What matters when writing code:

- Three memory types — **explicit** (Food Profile, Kitchen staples; built),
  **routine** (default contexts for weekday lunch / weekday dinner / weekend;
  not built), **behavioral** (what the user selects and actually eats; recorded
  but not yet read back).
- **One choice never establishes a permanent preference.** **Non-selection is
  never dislike** — an unpicked recommendation and a "Show me 3 more" carry no
  negative signal.
- **Explicit beats inferred, in a hierarchy.** (1) *Hard constraints* —
  allergies, dietary restrictions, safety exclusions, feasibility limits — are
  never overridden by inferred behavior and never inferred from it. (2) *Soft*
  explicit preferences (including disliked foods) start at higher confidence
  than inferred ones; repeated behavior may gradually adjust their ranking
  weight. (3) Inferred preferences start lowest. Definitions:
  `PRODUCT.md` → "Hard constraints vs. soft preferences."
- **Behavior never silently rewrites an explicit Profile field.** It may shift
  a ranking weight; only the user (or an accepted one-tap suggestion) changes
  a stored value.
- **Learning never removes the three-option contract** or makes `alternative`
  less different.
- Inferred memory ships only with a way for the user to see and reset it.
- Rules-based only: no trained models, no vector database (current non-goals).
- Do not build any of the routine or behavioral layers until `PLAN.md`
  promotes it. Today, only explicit memory exists.

## Kitchen staples vs. today's food

**Product-level rule, not just an implementation detail.** There is no
general "pantry" concept in this product. There are exactly two ingredient
sources, and they are never merged into one persisted list:

- **Me → Kitchen staples.** Persistent condiments and seasonings only — salt,
  oil, soy sauce, vinegar, spices. Never actual food: no chicken, tofu, eggs,
  produce, grains, dairy. Kitchen staples persist until the user edits them.
- **Today → "What do you have right now?"** The food actually available for
  *this* meal, entered fresh each time. This is never saved and never
  assumed to persist across future meals or sessions — a "Use what I have"
  request five minutes from now starts from an empty list again unless the
  user re-enters it.

**The canonical availability rule** for a cook recommendation, everywhere it
is used — model input, server-side validation, the recipe's structured
ingredients, the "Have" display, and the recipe's own instructions — is:

```
availableIngredients = todaysFoods + kitchenStaples
```

Water is the only implicit ingredient beyond that. Salt, pepper, oil, garlic,
and anything else — however common in most kitchens — are only available when
they are in one of those two lists. No other source is ever merged in, and no
ingredient outside `availableIngredients` may appear in a recommendation's
title, its structured ingredient fields, or its steps.

This exists because merging a general, persisted "pantry" into every request
goes stale: an item entered once (a real, perishable "Chicken") would be
silently assumed available forever. See `LEARNINGS.md` if this assumption is
ever revisited.

Consequences for "Use what I have" (`shopping: "inventory_only"`):

- It can return **0–3 recommendations** — never padded to three by inventing
  an ingredient the user doesn't have. Fewer, or a very simple result, beats
  a recipe that quietly assumes something extra.
- When `availableIngredients` genuinely can't support a reasonable meal, the
  right outcome is **zero recommendations plus the purchase fallback** ("Show
  me what to buy," which reruns as "I can buy a few things" optimized for the
  fewest additional items) — never an invented recipe just because it happens
  to pass the ingredient check.

## Preferences have provenance — never invent one

A value is **the user's** only if they set it. Three origins, never confused:

- **explicit** — set in Me (recorded in `profiles.prefs.explicit_fields`; see
  `src/lib/profileProvenance.ts`);
- **remembered** — chosen in a real earlier session (`rememberedDefaults`);
- **fallback** — a number the system needed (`SYSTEM_FALLBACKS`): internal only,
  **never shown as a choice, never labelled "usual", never stored** in the
  Profile or in a session context.

Say "My usual" only of an explicit value and "Last time" only of a remembered
one; a user with neither just picks. Unknown equipment means **no appliance
assumed**, never "stovetop + microwave". Do not write a whole form back to the
Profile — write only what the user set (`src/lib/profileStore.ts` is the one
write path). The database's `NOT NULL DEFAULT` columns prove nothing on their own.

## A user's data has one definition

Every table keyed to a user is listed once in `src/lib/accountData.ts`
(`USER_TABLES`); **Reset my data** and **Delete my account** both clear exactly
that list, so a reset account equals a new one (no rows, no profile row). **When
you add a table keyed to `auth.users`, add it there** — a test reads the SQL and
fails otherwise. Keep client state out of localStorage/sessionStorage: reset
relies on a full page load to drop everything in memory. The service-role key
(`SUPABASE_SERVICE_ROLE_KEY`, server-only, `src/lib/supabase/admin.ts`) is used
for account deletion and nothing else.

## Minimum decisions, progressive disclosure

**The user should make the minimum number of decisions possible.** The
product's job is to absorb complexity and progressively reveal only what is
needed for the current task — not to lay out every control at once and let
the user sort it out.

Concretely:

- Sequence decisions instead of presenting them together. "Question → answer
  → next question → recommendation" is the target shape, not "one screen with
  many chips, sliders, and fields visible at the same time."
- Hide advanced/optional fields behind a disclosure until the user asks for
  them, rather than showing every field up front "just in case."
- When adding a field or control to a decision flow, ask whether it can be a
  smart default instead of a question. A control that can't yet be removed
  should still be sequenced, not stacked onto whatever screen is already
  busiest.

This supersedes any earlier assumption that all of a flow's fields belong on
one screen together (that was the shape of the original Today page, and it is
what this principle exists to correct — see `PLAN.md` for the in-progress
refactor).

## The top-level information architecture (navigation, not scope)

The app has **five** top-level navigation areas. As before, they are **UI
containers, not a list of MVP capabilities** — product capabilities cut
across them, and a container existing does not put its contents in scope.

| screen | internal route | what it is |
|---|---|---|
| **Home** | `/today` (route name kept for now — see below) | "What should I eat?" Three equal entry choices: **Make something** (Cook), **Get food** (Eat out — the umbrella for all non-cooking decisions; nearby discovery is a capability *inside* it, not a new Home intent), and **Grab a snack**. Plan ahead (the future Stock up domain) is unbuilt. It is one decision per screen — first-run setup (allergies, foods you don't eat), a quiet "Last time … Use again" shortcut, a mode's own screen (last answers + Edit + one CTA) for a mode already used, one question at a time, then the three cards one at a time — driven by the screen reducer in `src/app/today/flow/homeReducer.ts`. Memory is a shortcut, never the headline and never an extra confirmation screen. All of it stays inside Home — there is no separate "Results" route. |
| **Plan** | `/plan` | Container for short-horizon flexible provisioning (not fixed meal planning) and saved recipes. Label under review — see `PRODUCT.md` → Terminology. Deliberately an empty placeholder until its contents are promoted into `PLAN.md`. |
| **Groceries** | `/groceries` | Container for one consolidated grocery list derived from saved recipes' missing ingredients or a stock-up basket. Deliberately an empty placeholder until its contents are promoted into `PLAN.md`. |
| **Saved** | `/saved` | Recipes (Cook recommendations) and places (nearby recommendations) the user explicitly saved to come back to, in two sections. **Saved = interest only** — not picked, not ate, not loved — durable, per user, and **not read by any ranking**. Added 2026-09-30 at the founder's explicit request; see `PRODUCT.md` → "Saved". |
| **Me** | `/profile` (route name kept for now — see below) | The Food Profile — persistent preferences. Unchanged. |

**Route names are internal and independent of nav labels.** `/today` is
labeled "Home" in the UI and `/profile` is labeled "Me"; both route names are
kept as-is to avoid churn while the UX is still stabilizing, and may be
renamed later. Do not infer product meaning from a route's URL segment — the
table above and the visible nav label are the source of truth.

Do not add a sixth area. Do not add features to these areas without being
asked.

**Web beta (2026-11-07):** the bottom nav shows only **Home / Saved / Me**.
Plan and Groceries are still part of the information architecture, and their
pages are kept, but they are empty placeholders so they are not linked; add them
back to `BottomNav.tsx` when they have contents. Two public pages sit outside the
five areas and are not navigation: `/demo` (static labelled example) and
`/about` (privacy and estimates).

**Paid calls are metered per person, before the call.** Every paid entry point
(`/api/recommend`, nearby search, `/api/recommend/interpret`, nearby wording, picture
generation, place photos) spends `consumeUsage()` (`src/lib/usage/`) first — counted
even if the call fails, in Postgres, refused in production if it can't be checked.
A new paid call must be added to `limits.ts` and call it. Product events
(`src/lib/events/`) are names + enumerated props only — never text, health data or
location; a new event needs the schema, the SQL `CHECK` list and `metrics.sql`.

Two things follow, same as before:

- **A screen shell existing does not put its contents in scope.** `Plan` and
  `Groceries` are navigable today and deliberately empty; the functionality
  inside them is Extended MVP (or later), not Core-loop MVP.
- **Some capabilities have no screen of their own.** Feedback — "did you
  actually eat it?" — is a core-loop behavior that belongs wherever it fits in
  the flow, not necessarily a dedicated page.

**What changed from the previous five-screen structure (My Food / Inbox /
Profile / Today / Results):** `My Food` and `Inbox` are no longer separate
top-level nav areas. Their future functionality doesn't disappear — history
and favorites move conceptually toward `Groceries` and `Me`; Recipe
Inbox moves conceptually toward `Plan` (saving recipes while planning ahead).
None of that is built yet; this is a navigation and documentation change, not
an implementation of any of it. `Results` was never reachable from the bottom
nav and had become an orphaned placeholder route (`/results`, a leftover
`ComingNext` stub) now that the real recommendation view renders inline
within Home — that file was removed as part of this same cleanup. Folding
`Results` into `Home`'s description here is a documentation correction, not a
behavior change.

`PRODUCT.md` is the authority on product scope, `PLAN.md` on build priority.
Neither is settled by this list of screens.

## Current non-goals

**Current non-goal** means: *do not build during the current MVP phase unless
it is explicitly promoted into `PLAN.md`.* It is not a permanent ban — some of
these also appear in `PRODUCT.md` under Possible future directions. Neither
status is permission to build.

Native iOS/Android apps · real-time grocery pricing · Instacart · grocery
delivery, checkout, and inventory integrations · barcode scanning · exact
ingredient quantities · expiration-date tracking · Apple Health · wearables ·
automatic and manual calorie or macro logging · carbohydrate/fat targets ·
social or community features and feeds · autonomous AI agents · vector
databases · trained recommendation models · fixed weekly meal planning ·
complex dashboards · subscriptions or payments · admin dashboards · Instagram or
TikTok scraping · browser extensions · iOS share extensions · and everything
listed under "Not part of this slice" in `PRODUCT.md` → "Eat out — nearby"
(marketplace behavior, full menus, item-level availability/nutrition, ordering,
reservations, reviews).

Nearby restaurant/café **discovery** is *not* a non-goal (promoted to NEXT
2026-09-29) but is still not built. Identity-level exclusions are in
`PRODUCT.md` → "Product identity and guardrails."

## Stack

- **Next.js (App Router) + TypeScript**
- **Tailwind CSS v4** — configured in `src/app/globals.css` via `@import "tailwindcss"`.
  There is no `tailwind.config.js` and none is needed.
- **Supabase** — Postgres, Auth (magic link), Row Level Security.
- **Server Actions** for writes; **Route Handlers** for LLM calls.
- Deploys to **Vercel**.

## Architecture rules

- **Secrets are server-only.** Anything without a `NEXT_PUBLIC_` prefix stays
  on the server. The LLM API key is used only inside `src/app/api/**`. Never
  call an LLM provider from a client component.
- **RLS is the authorization layer.** Every table keyed by `user_id` with a
  policy of `auth.uid() = user_id`. App code does not re-implement this.
- **Server Components read, Server Actions write.** Reach for `"use client"`
  only when a component needs interactivity (chips, sliders, toggles). Keep
  client components small and leaf-level.
- **Two Supabase clients, do not mix them up:**
  - `src/lib/supabase/server.ts` — for Server Components, Server Actions,
    Route Handlers. Reads the session from cookies.
  - `src/lib/supabase/client.ts` — for client components only (used for
    sign-in/sign-out).
- Prefer simple columns plus JSONB for flexible preference lists. Do not build
  a normalized nutrition database.
- **External integrations are narrow, replaceable, and cost-controlled**
  (principle: `PRODUCT.md` → "External integrations"). Put every third-party
  data source behind a small provider interface, following the existing
  `ImageProvider` in `src/lib/images/provider.ts`; the rest of the app depends
  on the product's own minimal shape, never a vendor's raw response. Keys are
  server-only. Request only the fields the decision needs; make usage and cost
  observable; do not depend on costly optional metadata. Nearby-places
  provider for v1: Google Places API (New), in `src/lib/places/` behind the
  `PlacesProvider` interface; key `GOOGLE_PLACES_API_KEY` is server-only. Rules
  specific to it: **code picks the places, the model only words them.** The
  three places come from the retrieved candidates by deterministic rules
  (`src/lib/recommend/nearbyPicks.ts`: open now, distance vs. how far the user
  would go, price level vs. meal budget, their own "not for me" feedback, a soft
  craving fit) after hard constraints have removed places that centre on an
  allergen or the dietary pattern (`placeExclusions.ts` — a short literal
  name/type table; not a safety guarantee). They are stored and shown with a
  rule-written reason and no model call; a small fast model then writes each
  card's "why" and "what to look for" afterwards (`/api/recommend/enrich`,
  `enrich.ts`), validated the same way the one-shot output always was, and can
  never add, drop or reorder a place. A model failure leaves the rule-written
  reasons. Places is not a menu database, so nearby output states no exact menu
  items, prices, calories, or macros. It returns exactly three places when
  three or more real candidates remain, otherwise all of them, and treats
  disliked foods as a soft signal. A restaurant card shows the place's own
  Google photo (fetched lazily, server-side, `/api/place-photo`) or a neutral
  placeholder — **never a generated image of a real place**. User coordinates
  are used for the one request and never stored or logged.
- **Recipe images: photo → cache → generate once.** A Cook card's image comes
  from a relevant real photo, else a previously generated image (shared cache:
  `recipe_images` table + `recipe-images` Storage bucket, keyed by a hash of
  title + main ingredients + cooking method — `src/lib/images/recipeKey.ts`),
  else one image is generated (`generated.ts`, behind `ImageGenerator`;
  `OPENAI_API_KEY`) and kept. It always runs AFTER the card's text is on screen,
  only for a card about to be seen, from the stored recipe (never request
  text), and any failure leaves the quiet no-photo band.
- **Measure before optimizing.** Every recommendation request logs a stage
  timing table (`src/lib/timing.ts`; also a `Server-Timing` header). The user
  waits only for what the cards need: independent reads run together, the
  session row is written before the cards show (Save and Choose depend on it),
  and images, nearby wording and re-scoring happen after.
- **Saved failures are diagnosable.** Every failed save logs the operation, item
  type, database code and likely cause (`src/lib/saved/failure.ts`); in
  development the same line is shown next to the button, and
  `/api/dev/saved-check` (dev only) runs each layer as the signed-in user.
  Production shows only the simple message.

## LLM rules

- The model is **not a chatbot**. The server builds a structured context object
  and asks for **structured JSON back**. Never render raw model prose.
- The context contains: persistent profile, current meal context (including
  Kitchen staples — see "Kitchen staples vs. today's food" above), relevant
  saved recipes.
- **Hard constraints are stated explicitly and separately** from soft
  preferences, and are non-negotiable in the prompt. Definition and tiers:
  `PRODUCT.md` → "Hard constraints vs. soft preferences." Allergies (Profile
  v2) and the **dietary pattern** (vegetarian, vegan, pescatarian, halal,
  kosher, other — stored in `profiles.prefs.dietary`) are hard constraints in
  every mode; disliked foods are soft everywhere. Allergens also get a literal
  allergen-name check in code (`findAllergenMentions`; no aliases, not a safety
  guarantee): on the food fields of every Cook, Get food and Snack card
  (`output.ts` → `findAllergenViolations`; a hit rejects the set, which gets one
  automatic retry — see `claude.ts`), and on Nearby's `look_for` (withheld). The
  dietary pattern gets a literal word check on Cook recipes only (`textChecks.ts`;
  alcohol, halal sourcing and meat+dairy are prompt-level). *Remaining gap:* both
  checks are only literal — a hidden ingredient or an alias ("shrimp" for
  Shellfish) is still the prompt's job. Do not paper over either ad hoc.
- The optimization target, stated verbatim to the model:
  > "The probability that the user will actually eat this meal tonight while
  > still moving toward their health goal."
- Return **three** *decision* recommendations per `PRODUCT.md` → "Exactly 3"
  (fewer only when fewer valid real options exist; execution artifacts are
  one), with distinct purposes: `best_match`, `lowest_effort`, and
  `alternative` — a meaningfully different option in cuisine, style, or
  protein source; it may be somewhat higher in protein when useful, but does
  not optimize for the maximum protein possible.
- Validate the JSON shape before it reaches the UI. If the model returns
  something unusable, fail visibly rather than rendering half a card.
- **Nutrition numbers are estimates.** Display them as "~32g protein",
  "~550 cal". Never imply precision we do not have.
- **Two costs, one budget.** `estimated_meal_cost_usd` is the approximate value
  of everything eaten, including food already owned. `estimated_extra_cost_usd`
  is the approximate money spent tonight on missing ingredients. The budget
  ceiling applies to extra cost only. Display as "~$9 meal · ~$2 more to buy".
  Both are model-only guesses with no price data — low confidence.
- **Eat out budget is a different field.** `meal_budget` (order/nearby) is a
  soft ranking signal, never the Cook budget and never a price ceiling; a
  missing value means "no_preference". Nearby derives `budget_fit` from the
  coarse Places `price_level`; a null level stays unknown and gets no price
  claim. Definition: `PRODUCT.md` → "Budget means two different things."
- **Protein is a range, not a maximum.** Anchor each meal on roughly a third of
  the daily target, somewhat higher when very hungry or asking for protein,
  lower for a light meal. It is a soft preference, last in the priority order.
  There is no server-side protein validator; do not add one.
- **Calories are a soft envelope, not a minimum.** With daily energy guidance
  set, meal ranges are computed from it and scaled by hunger. Without one, give
  qualitative goal direction only — never assume a number or reuse an example
  range as a default. Never imply knowledge of calories remaining today. No
  server-side calorie validator.
- **Targets are context, not a ledger.** Near-term nutrition guidance is only
  an estimated daily energy range and a protein target/range; there are no
  carbohydrate or fat targets, and **no energy estimate is fabricated when the
  required Profile inputs are missing** (`PRODUCT.md` → Nutrition target
  refinement). They size a meal; never phrase output as tracking ("you have X
  left", "you're over", "log this"), and never ask the user to record what they
  ate beyond the core-loop "did you eat it?".
- **Equipment is a hard constraint, and it is never assumed.** Only what the user
  said they can cook with (asked the first time they cook, editable in Me)
  counts; unknown behaves as "no appliance". Steps that name an appliance the
  user doesn't own are rejected (`textChecks.ts`). **"No cooking at all" (or unknown equipment) means the user assembles ready-to-eat ingredients** — no heat of any kind, and not a bought hot meal (that is Get food, not Make something); `findNoCookViolations` rejects a set that needs heat or is a prepared hot meal.
- **Recipes must not need a kitchen scale.** Everyday or visual measure first,
  approximate weight second only where it helps the nutrition estimate.

## UX principles

- Mobile-first. Warm, clean, consumer — not a developer dashboard.
- **Chips, buttons, defaults, one-tap.** The user should almost never type.
  Free text is allowed only where there is no alternative (dislikes, craving).
  The one exception: the one-sentence entry ("Tell me what's going on",
  `PLAN.md` NEXT, **built 2026-11-07, unvalidated**) — a single sentence read into
  the existing structured context (`/api/recommend/interpret`), beside the
  chips, never a chat. Its rules: the sentence is untrusted data; it fills only
  what was clearly said (never an ingredient, budget, place or equipment
  inferred); a real earlier answer may fill a gap but never beats the sentence;
  only what a request cannot go without is asked (one `ClarifyScreen`, not the
  questionnaire again); it never sees the Profile, so hard constraints are
  applied by `/api/recommend` exactly as for any request; it is never stored or
  logged. "Voice" is the phone keyboard's own dictation — not an in-app feature.
- Every field has a sensible default so the user can hit the button immediately.
- Show **three** recommendations when the user is deciding (`PRODUCT.md` →
  "Exactly 3"). Never a longer list.
- Short copy. No jargon. No empty states that just say "No data".
- **One auto-advance rule** for question screens, by kind of input
  (`src/app/today/flow/steps.ts → STEP_KINDS / autoAdvances`): a pure single
  choice moves on by itself after a beat (on the last question that move is
  sending the request); several controls on a screen, multi-select, typed text,
  a slider/number, or a choice that reveals more controls wait for an explicit
  Continue. Every screen keeps its button so a preselected answer can be accepted.
  New questions are added to that table with their kind, nowhere else. Moves go
  through one scheduler (`flow/advance.ts`) so a double tap is one navigation.

## Coding conventions

- TypeScript `strict`. No `any` — use `unknown` and narrow.
- Shared types live in `src/lib/types.ts`. Option lists (cuisines, equipment,
  goals) live in `src/lib/options.ts` so the UI and the prompt use the same
  vocabulary.
- Components: `PascalCase.tsx` in `src/components/`. Route files follow Next.js
  conventions (`page.tsx`, `route.ts`, `actions.ts`).
- Server Actions live in an `actions.ts` next to the page that uses them and
  start with `"use server"`.
- Tailwind utility classes inline. No CSS modules, no styled-components.
- Keep files short. If a page component passes 150 lines, extract a component.

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Database setup: paste `supabase/schema.sql` into the Supabase SQL editor.

Checks before committing:

```bash
npm run typecheck
npm run lint
```
