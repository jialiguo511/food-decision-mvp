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

## Product decision rules

### Document authority

Read these before making any product change. When they disagree, the higher
one wins:

1. **`PRODUCT.md`** — why the product exists, product principles, scope
   definitions
2. **`PLAN.md`** — what we are actually building now / next
3. **`LEARNINGS.md`** — evidence that may change our assumptions
4. **`CLAUDE.md`** — rules for implementing the product

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
  It is a product principle, not a default value.
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
- **Extended MVP** — Recipe Inbox / recipe memory · simple pantry · meal
  history · favorites · recent-meal awareness · basic preference learning.
  Useful, but build only after the core loop works end to end.

## The five screens (navigation, not scope)

The app has five navigation areas. They are **UI containers, not a list of MVP
capabilities** — product capabilities cut across them.

| screen | what it is |
|---|---|
| **Today** | Dynamic context capture + the "Find my meal" button |
| **Results** | The recommendation flow — exactly three cards |
| **My Food** | Container where pantry, history and favorites may eventually live |
| **Inbox** | Recipe Inbox — paste text, paste URL, manual save |
| **Profile** | My Food Profile — persistent preferences |

Do not add a sixth area. Do not add features to these areas without being asked.

Two things follow:

- **A screen shell existing does not put its contents in scope.** `My Food`
  and `Inbox` are navigable today and deliberately empty; the functionality
  inside them is Extended MVP, not Core-loop MVP.
- **Some capabilities have no screen of their own.** Feedback — "did you
  actually eat it?" — is a core-loop behavior that belongs wherever it fits in
  the flow, not necessarily a dedicated page.

`PRODUCT.md` is the authority on product scope, `PLAN.md` on build priority.
Neither is settled by this list of screens.

## Current non-goals

**Current non-goal** means: *do not build during the current MVP phase unless
it is explicitly promoted into `PLAN.md`.* It is not a permanent ban — some of
these also appear in `PRODUCT.md` under Possible future directions. Neither
status is permission to build.

Native iOS/Android apps · real-time grocery pricing · Instacart · restaurant
APIs · delivery ordering · barcode scanning · exact pantry quantities ·
expiration-date tracking · Apple Health · wearables · automatic calorie
logging · social or community features · autonomous AI agents · vector
databases · trained recommendation models · weekly meal planning · complex
dashboards · subscriptions or payments · admin dashboards · Instagram or
TikTok scraping · browser extensions · iOS share extensions.

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

## LLM rules

- The model is **not a chatbot**. The server builds a structured context object
  and asks for **structured JSON back**. Never render raw model prose.
- The context contains: persistent profile, current meal context, pantry,
  relevant saved recipes.
- **Hard constraints are stated explicitly and separately** from soft
  preferences: unavailable equipment, maximum cooking time, strong dislikes,
  budget ceiling. These are non-negotiable in the prompt.
- The optimization target, stated verbatim to the model:
  > "The probability that the user will actually eat this meal tonight while
  > still moving toward their health goal."
- Always exactly **three** recommendations, with distinct purposes:
  `best_match`, `lowest_effort`, and `alternative` — a meaningfully different
  option in cuisine, style, or protein source; it may be somewhat higher in
  protein when useful, but does not optimize for the maximum protein possible.
- Validate the JSON shape before it reaches the UI. If the model returns
  something unusable, fail visibly rather than rendering half a card.
- **Nutrition numbers are estimates.** Display them as "~32g protein",
  "~550 cal". Never imply precision we do not have.
- **Two costs, one budget.** `estimated_meal_cost_usd` is the approximate value
  of everything eaten, including food already owned. `estimated_extra_cost_usd`
  is the approximate money spent tonight on missing ingredients. The budget
  ceiling applies to extra cost only. Display as "~$9 meal · ~$2 more to buy".
  Both are model-only guesses with no price data — low confidence.
- **Protein is a range, not a maximum.** Anchor each meal on roughly a third of
  the daily target, somewhat higher when very hungry or asking for protein,
  lower for a light meal. It is a soft preference ranked last, after likelihood
  of eating, context and craving, feasibility, and the health goal. There is no
  server-side protein validator; do not add one.
- **Calories are a soft envelope, not a minimum.** With a daily calorie target,
  meal ranges are computed from it and scaled by hunger. Without one, give
  qualitative goal direction only — never assume a number or reuse an example
  range as a default. Never imply knowledge of calories remaining today. No
  server-side calorie validator.
- **Recipes must not need a kitchen scale.** Everyday or visual measure first,
  approximate weight second only where it helps the nutrition estimate.

## UX principles

- Mobile-first. Warm, clean, consumer — not a developer dashboard.
- **Chips, buttons, defaults, one-tap.** The user should almost never type.
  Free text is allowed only where there is no alternative (dislikes, craving).
- Every field has a sensible default so the user can hit the button immediately.
- Show exactly **three** recommendations. Never a longer list.
- Short copy. No jargon. No empty states that just say "No data".

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
