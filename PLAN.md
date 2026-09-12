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
- [ ] **`/api/recommend`** — *the next engineering milestone, once the Today
      UX review is done.* Assemble profile + context + pantry + saved recipes
      into a structured prompt. Hard constraints stated explicitly. Return
      validated JSON.
- [ ] **Exactly 3 recommendations** — `best_match`, `lowest_effort`,
      `alternative`. Never a longer list.
- [ ] **Select a recommendation** — writes `decision_sessions.chosen_index`.
- [ ] **Record whether it was actually eaten** — writes `meal_feedback`. This
      is the success event the whole product is measured by.
- [ ] **Basic rejection / feedback reason** — why they did not eat it.
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
- Nutrition target refinement — suggested daily calorie target
  (BMR → TDEE → goal adjustment), protein kept prominent, carbs and fat
  optional. Must not turn the product into macro tracking. See `PRODUCT.md`.
- Basic product analytics
- Recruit the first 5–15 external testers

---

## LATER — only after evidence

Parked. These correspond to `PRODUCT.md` → Possible future directions.

- Grocery intelligence — pricing, store integrations, shopping convenience
- Advanced recipe importing — social ingestion, video extraction, browser and
  share extensions, automatic adaptation of imported recipes
- Personal recipe capture — "I made something I liked", described by text or
  voice, converted into a reviewable structured recipe
- Nearby restaurant alternatives
- Cook / assemble / buy comparison
- Weekly meal planning
- Native mobile app
- Sophisticated recommendation models
- Household mode
- Subscriptions

> **LATER items are not promises.** An idea listed only in `PRODUCT.md` Future
> Directions may not be built. It must first be explicitly promoted into NOW
> or NEXT in this file. Record the evidence that justifies a promotion in
> `LEARNINGS.md`.

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
| `decision_sessions` | one "Find my meal" event | context JSONB + the 3 recs JSONB |
| `meal_feedback` | did they actually eat it | links back to a session |

Lists (cuisines, dislikes, equipment) are JSONB rather than join tables. They
are read and written as a whole, never queried across users, so a normalized
table would add migrations and joins and buy us nothing.

Nutrition is **estimates stored alongside each recommendation**, not a
nutrition database. We are not building a calorie tracker.
