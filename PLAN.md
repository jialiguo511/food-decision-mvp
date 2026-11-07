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

Strategy reassessment, 2026-10-05 (documentation only, no code): the product is
now framed as a **wedge** (fast next-meal decision support) plus a
**long-term hypothesis** (a personalized decision system that gets better with
each decision) — see `PRODUCT.md` → "Strategy — the wedge and the long-term
product". The four stages below are the sequencing frame for that. **They
promote nothing.**

---

## Strategic stages — sequencing, not authorization

Added 2026-10-05. NOW / NEXT / LATER below remains the only thing that
authorizes work. This section says *why those items are in that order* and what
question each stage must answer before the next is worth starting. Do not read a
stage's scope list as "build this" — an idea named here but not in NOW or NEXT
is still a LATER idea.

(Naming: these are the **strategic stages**. They are unrelated to the
**proof steps** in `PRODUCT.md`, and to the dated "Stage 1 navigation/IA
refactor" below, an older use of the word.)

| stage | question it answers | lives in this file as |
|---|---|---|
| **1 — Reliable decision MVP** | Can users repeatedly get a useful answer to "what should I eat right now?" **in seconds**? | NOW, plus the NEXT items already built for reliability |
| **2 — Feedback + memory** | Can the product learn from low-friction signals without asking for logging? | NOW's feedback items, plus NEXT |
| **3 — Personal decision model** | Does it become meaningfully different for two people asking the same question? | LATER |
| **4 — Broader food intelligence** | Do richer data sources and proactive help add value on top of a working loop? | LATER / NOT NOW |

### Stage 1 — Reliable decision MVP *(current)*

Make the existing experience actually work well. Scope — all of it is existing
NOW/NEXT work; nothing new is promoted here:

- Cook / Eat out / Snack as three **interaction modes** over one decision
  system (`PRODUCT.md` → "Modes are interaction modes")
- strong constraint compliance — allergies, foods avoided, dietary pattern
  (hard vs. soft per `PRODUCT.md`)
- kitchen constraints — equipment never assumed, Kitchen staples, today's food
- distance (travel willingness) and budget (the two kinds, never merged)
- nutrition goals influencing recommendations
- Save
- recommendation **latency**, **quality**, and **mobile reliability**
- clear retry / change-answer behavior (Edit, Back, "Show me 3 more")

**No numeric latency or quality target is set yet.** Choose one from real
founder-use timing data (`src/lib/timing.ts`) rather than inventing it.

**Exit signal:** proof steps 1–2 in `PRODUCT.md` — the founder uses it
repeatedly for at least 7 days, and 5–15 target users use it. Without that,
Stages 2–4 are building on an unproven wedge.

### Stage 2 — Feedback + memory

Low-friction behavioral learning. Scope:

- ate this · not interested · too expensive · too much effort · not available
- favorite / save
- restaurant and meal preference learning
- recent-meal memory and lightweight history

**Constraint:** no heavy manual logging. Every signal is one optional tap and
never blocks the user. Reasons must separate *context* (effort, price, time,
not hungry) from *taste*, because the learning rules depend on it
(`PERSONALIZATION.md` → Signal strength).

**Gate:** reading inferred memory back into recommendations ships together with
a way to see and reset it (`PERSONALIZATION.md`, principle 7).

**Built ahead of the gate, at the founder's explicit request** (so the order is
not misread as clean): behavioral hints v0, last-used chip defaults, Saved, and
place "Not for me" feedback. Behavioral hints v0 is the one that *reads*
history back — and it still lacks the see-and-reset surface. That is a known
open gap, not a finished Stage 2 item.

**Exit signal:** feedback is given at a meaningful rate without prompting
fatigue, and input per decision falls for returning users while picks stay
accepted (proof step 5). Neither is measured yet.

### Stage 3 — Personal decision model

Use accumulated behavior and context to rank recommendations *for this user*.
Two people asking the same question should get meaningfully different answers.

> **Flag — non-goal conflict, resolved conservatively.** "Model of the user"
> here means a **rules-based, inspectable ranking over the user's own history**
> (the conceptual shape in `PRODUCT.md` → "Future ranking engine"). It does
> **not** mean a trained recommendation model or a vector database — both are
> current non-goals (`PRODUCT.md`, `CLAUDE.md`). Changing that requires editing
> `PRODUCT.md` first, with evidence in `LEARNINGS.md`.

Includes inferred routines (always confirmed with one tap, never applied
silently) and `historical_acceptance` in ranking. Hard constraints never move.
**Gate:** Stage 2 exists and has produced enough real history, plus evidence
that history improves acceptance (proof step 6). Not scheduled.

### Stage 4 — Broader food intelligence

Possibilities only; **no commitments**, each needs its own promotion:

- richer restaurant integrations (menu data — see the location roadmap below)
- grocery intelligence
- health integrations — Apple Health and wearables are **current non-goals**
- adaptive nutrition targets — must not become tracking
- proactive suggestions — would be the product's first push-style behavior;
  check it against "minimize time spent deciding" before promoting
- **automatic pantry understanding** — *flag:* this contradicts the current
  rule that there is no persisted inventory ("Kitchen staples vs. today's food",
  `CLAUDE.md`), which exists because stored food goes stale. It could only be
  considered by first revisiting that rule in `PRODUCT.md`, with evidence.
- longer-horizon planning — *flag:* only in the **flexible provisioning** form
  (Stock up). Fixed meal schedules remain excluded by product identity.

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

## Done — UX V2 interaction redesign, 2026-09-30

Founder-requested pause on feature work to redesign the interaction layer
only. **No changes** to `/api/recommend`, prompts, validators, the places
provider, Saved/feedback logic, personalization rules, session restore (6h),
or the schema (setup uses the existing `profiles.prefs` column).

- [x] Home is one decision at a time: a typed screen reducer
      (`src/app/today/flow/homeReducer.ts`) — setup → start → "use my usual" →
      one question per screen → results. `useRecommend` is unchanged.
- [x] Start: "What should I eat?" → Make something / Get food / Just a snack.
      Returning users get **"Use my usual"** (last settings for their last
      mode, from `rememberedDefaults`) — one tap to three ideas.
      *Hypothesis*, not validated: most returning decisions reuse last settings.
- [x] Question order — Cook: hunger → time & effort → shopping → budget (if
      buying; today's foods one tap away) or today's foods (if "Use what I
      have") → craving. Eat out: method → hunger → craving → budget → how far
      (Pickup / Eat nearby only). Pickup and Eat nearby search real places;
      Delivery gets food ideas by type (also offered as a fallback).
- [x] Results: one card at a time (scroll-snap carousel, arrows, dots,
      "1 of 3"). **Swipe is browsing only** — it records nothing. Compact
      cards with progressive disclosure ("View recipe", "More"); explicit
      Save / Not for me / Choose this unchanged; "None of these? Show me 3
      more" under the cards; a clear "this is your pick" state.
- [x] First-run setup (goal → allergies → dislikes → limits → about you →
      summary), every screen skippable, saved through the same
      `validateProfileForm` + `profiles` upsert as Me, offered once. See
      `PERSONALIZATION.md` → "What personalization must not become" for how
      this is bounded.
- [x] Human-readable loading, error and empty states; raw server/model
      errors are logged, never shown. SVG nav icons; consistent button,
      chip and card sizes; no floating buttons.

Not done, on purpose: Plan and Groceries functionality, any history-synced
browser Back for Home's steps, a native wrapper/PWA install flow.

---

## Done — UX V3 pass (home, setup, loading, Me), 2026-10-01

Founder-requested interaction pass; UI and state flow only. **No changes** to
`/api/recommend`, prompts, validators, places, Saved/feedback, remembered-default
rules, session restore (6h) or the schema (the one new flag, the nutrition
step's dismissal, lives in the existing `profiles.prefs` JSON).

- [x] Home leads with the three kinds of help — Make something / Get food /
      Grab a snack — equal weight. Memory is one quiet "Last time … Use again"
      line under them, not a hero card.
- [x] "Same as usual?" is gone. A mode the user has used opens on its own
      screen: last answers as one line, **Edit**, one CTA. A mode they haven't
      goes straight to question 1. CTAs name the action: *Show me meals* /
      *Find food nearby* / *Find something to order* / *Find me a snack*.
- [x] First-run setup is two skippable screens (allergies, then foods you
      don't eat) — no goal, no body details, no summary screen.
- [x] The optional nutrition step (goal, then age/sex/height/weight/activity)
      is offered once, as a quiet card under the first results — only to users
      whose Profile cannot yet estimate energy and who set no calorie target.
      Pre-filled from what is stored; "Not now" writes only a dismissal.
- [x] Me is grouped by what the answer does: Food preferences (always used) ·
      My goals · Nutrition targets (optional, collapsed) · Kitchen basics.
- [x] Loading is a short list of what's being taken into account plus three
      slim placeholders — no oversized fake card, no horizontal overflow.
- [x] Mode memory is live: a mode used since the page loaded is offered back
      without a reload (the server-read `remembered` map was stale until then).

Not done, on purpose: a Profile field for dietary restrictions (vegetarian,
halal, …) — still the open item under *Hard dietary constraints* below; a
schema change; any history-synced browser Back for Home's steps.

---

## Done — usability + correctness pass, 2026-10-01 (after UX V3)

Founder-tested as a brand-new user; no visual redesign. One root cause behind
most of it: **a system fallback was indistinguishable from something the user
said** (invented "My usual — $12", "30 min", a microwave they never mentioned).

- [x] **Provenance.** Five Profile fields had `NOT NULL DEFAULT` columns, and
      every save wrote the whole form back. A stored value now counts as the
      user's only if it is listed in `profiles.prefs.explicit_fields`
      (`src/lib/profileProvenance.ts`); otherwise it reads as *Not set*. Three
      origins, never confused: **explicit** (Me) · **remembered** (a real earlier
      session) · **fallback** (`SYSTEM_FALLBACKS`, internal, never shown, never
      stored). No schema change.
- [x] Me shows *Not set* for goal, equipment, fridge, usual time and usual budget
      until chosen; clearing one returns to no default.
- [x] **Cook asks "What can you cook with?" the first time** (not in global
      setup). Until answered, the recommender assumes **no appliance**
      (`equipment_known: false`, treated as no-cook), and generated steps are
      checked for appliances the user doesn't own (`lib/recommend/textChecks.ts`).
- [x] **Cook memory.** Time, effort, shopping mode ("Use what I have" stays
      strict — its foods are asked again) and the budget carry over from a real
      earlier request; craving and tonight's foods never do. An explicit Profile
      value beats a remembered one. "My usual" is only said of a Profile value,
      "Last time" of a remembered one; a new user just picks.
- [x] **Dietary pattern** (vegetarian / vegan / pescatarian / halal / kosher /
      other) — stored in `profiles.prefs.dietary`, collected in first-run setup
      and Me, and a **hard constraint in all four modes** (prompt for every
      mode, plus a literal check on Cook recipe text). Not a guarantee.
- [x] **Save**: root cause was environmental — `saved_recipes`, `saved_places` and
      `place_feedback` do not exist in the live database (migrations never run).
      Code was correct; failures now log the DB code and the fix.
- [x] **Request survives navigation**: the recommendation request/session lives
      in `src/app/today/recommendStore.ts`, outside React. Leaving Home mid-request
      and returning shows the loading state, then its cards — never the older page;
      no second request.
- [x] **Auto-advance is one rule** (`steps.ts → autoAdvances`): single choice, nothing
      else on the screen, not the last question. A late auto-advance can no longer
      fire after Back or Continue.
- [x] **Images**: no `PEXELS_API_KEY` in `.env.local` meant every card showed the
      empty 16:9 box. The no-photo state is now a short, deliberate band;
      transient provider failures are no longer cached as "no image" for 24h.

- [x] **Account & data** (bottom of Me): **Reset my data** (wipes every row the user
      owns, keeps the login — the result is exactly a brand-new account) and
      **Delete my account** (wipes the same, then removes the auth user server-side
      with `SUPABASE_SERVICE_ROLE_KEY`, then signs out). One shared list of
      user-owned tables (`src/lib/accountData.ts`), guarded by a test that reads
      `schema.sql`. Reset needs no admin key; delete refuses cleanly without it.

- [x] **2026-10-02 blockers pass** (founder's explicit promotion of AI recipe
      images and restaurant photos into NOW; nothing else was promoted):
      - Save: failures are diagnosable (structured server log, dev-only on-screen
        line, `/api/dev/saved-check`), per-card parsing, an optional idempotent
        `2026-10-02_saved_repair.sql`, and tests against real Postgres (PGlite).
      - Nutrition: one `calculateNutritionTargets`; cards on screen are re-scored
        and re-ordered (no model) when targets change; Me shows the daily range.
      - Question flow: one rule by input kind, last pure single choice sends.
      - Latency: stage timing everywhere; parallel reads; Get food (nearby) shows
        code-picked places immediately and the model only words them afterwards.
      - Images: Cook recipes without a relevant photo get one generated image,
        cached and shared (`recipe_images` + Storage); restaurants show their
        real Google photo or a placeholder, never a generated image.
      Cost notes: gpt-image-2 low/1536×1024 ≈ $0.005 an image, once per distinct
      dish; Google Place Photos are billed per photo fetched (lazy, ≤3 per
      nearby search). Founder-approved model change for Cook is still open.

Not done, on purpose: a schema change beyond the two above; non-Cook modes
asking equipment; remembering craving/tonight's foods; a server-side dietary
check beyond the literal Cook word list.


---

## Done — Stage 1 reliability pass, 2026-10-05

Founder-requested audit of the existing "what should I eat right now?" flow
against the updated docs, then only the highest-priority fixes. No new features,
no schema change, no new tables, no analytics. Evidence for the model choice:
`bench-results/recommend-2026-10-05*.md` (7 cases × 2 runs per config; real
prompt, parsing and validators).

- [x] **Latency.** The default recommender was Opus 5 at high effort: median
      25 s per Cook request (16–30 s), one model call and nothing else on the
      critical path (profile/staples/hints already ran together; images load
      afterwards). It is now **Sonnet 5.5, adaptive thinking, low effort**:
      median 8 s (7–9 s), ~$0.021 instead of ~$0.072 a request, every benchmark
      answer valid with no hard-constraint hits. Haiku 4.5 was no faster in
      practice and clearly less useful (14–18 g protein where the others give
      30–55 g). Still overridable per environment (`RECOMMEND_MODEL` /
      `RECOMMEND_EFFORT` / `RECOMMEND_THINKING`). The model call's timeout drops
      from 90 s to 45 s, so a hung call fails in under two minutes, not three.
      Closes the "Founder-approved model change for Cook is still open" note above.
- [x] **A rejected answer no longer reaches the user as an error.** A faster
      model now and then names an appliance the user doesn't own or breaks the
      JSON, and the whole set used to be thrown away ("The recommendations broke
      a hard constraint"). One automatic retry now happens in the same request,
      with the validator's finding fed back — only for malformed output or a
      constraint violation, only if the first try was under 25 s, never after the
      user moved on, and a second failure still fails visibly (the retry is not
      a bypass). This reverses the earlier "no repair loop" rule, deliberately
      and boundedly; the test that pinned it was rewritten, not deleted.
- [x] **Allergens are checked in code for Cook, Get food and Snack**, not only
      by the prompt (the same literal matcher Nearby already used; no aliases, so
      a catch for a slip, never a guarantee). A hit rejects the set and triggers
      the retry above.
- [x] **No more dead button while a request is running.** Every final "Show me
      meals / Find…" button, "Use again" and a mode's own CTA was disabled while
      any request was in flight — so Change → edit an answer → press the button
      during the wait was a greyed-out control with no explanation. The request
      store already makes a repeat submit one request and a different one
      supersede (and abort) the old, so the screens no longer add a silent rule
      of their own.
- [x] **Home opens faster.** Its seven Supabase reads ran one after another on
      every visit; the independent ones (profile, latest session, Kitchen staples,
      recent settings) now run together, then the three that depend on the
      restored session.

Verified as already correct, so left alone: the nutrition chain (height / weight
/ goal → calculated targets → model guidance and card re-scoring), "No cooking
at all" (prompt, code check, profile, unknown equipment = no appliance), travel
distance (search radius and feasibility), image loading (after the cards, never
blocking), Save, session restore (6 h), and the request store's double-tap /
supersede / navigate-away behaviour.

Not done, on purpose: no recipe photos without `PEXELS_API_KEY`; a doubled auth round-trip per request; no
numeric latency target or in-app measure of it; the see-and-reset gap for
behavioral hints; alias-aware allergen matching.

---

## Done — web beta pass, 2026-11-07

Founder-requested, on branch `codex/web-beta`: a testable, deployable web beta for a
résumé demo and a first small group of users. **Built and tested locally; not
deployed; not validated with any user.** Facts, checks and the setup list are in
`RELEASE.md`; this entry says what changed and why.

- [x] **Carousel pictures.** Root causes (not CSS): a card's picture waited on the
      viewport observer alone, which a horizontal scroller clips — card 2 loaded only
      because a sliver peeked in, card 3 only after the swipe, then a whole generation
      (tens of seconds) behind a placeholder; request state lived in the component, so a
      remount re-asked and a failure was final and indistinguishable from "no photo"; the
      placeholder, the picture and "no photo" had three different heights (a measured
      20–106 px jump); `/api/image` had no `maxDuration`, so a host could kill a generation
      after the vendor was paid and before it was stored. Fix: a card also loads when it is
      the active card or its neighbour (one ahead, never two); requests live in `imageStore`
      (one in flight per card, answers kept, failures retryable but capped); one fixed frame +
      caption line; the route says why there is no picture (`no_image` / `generation_failed` /
      `limit_reached`); `maxDuration` 60 > the 45 s generation timeout. *Not verified:* a real
      generated picture (no OpenAI/Pexels key here).
- [x] **One-sentence entry** (the NEXT item above). Home leads with a text box;
      step-by-step is the second path; "Last time → Use again" is unchanged. Reads into the
      existing vocabulary; said > remembered > missing; only the missing is asked; "What I
      understood" with Edit; never stored or logged. Checked on the real model (found and fixed
      one miss: "something nearby" wasn't setting the method). **Not built:** training load, a
      saved fridge, in-app voice, open chat.
- [x] **Per-person daily limits on every paid call**, atomic in Postgres, counted before the call
      and even on failure, refused in production if they can't be checked; clear copy; numbers in
      `src/lib/usage/limits.ts`.
- [x] **Minimal product events** + `supabase/metrics.sql` (picked→ate reuses `decision_sessions` /
      `meal_feedback`).
- [x] **Public `/demo` and `/about`**; nav = Home / Saved / Me (Plan, Groceries kept, unlinked);
      one `BRAND` constant.
- [x] **Deployment SQL proven** on a real engine; `check-schema.sql`.

- [x] **Preview feedback fixes, 2026-11-07** (two things found by using the Preview):
      (1) *Nearby "Show me 3 more" repeated places.* Root cause: the browser sent only the
      LAST batch and the server excluded only that, so batch 3 could repeat batch 1. Now one
      decision keeps the whole shown list (`shown_place_ids`: returned with each batch, sent back
      with the next "more", stored beside the session's context so a reload carries on from it);
      a fresh question starts a new list. Fewer than three left → exactly those, no padding,
      "More" hidden; nothing new left → `no_more`: nothing stored, the cards on screen stay, a
      notice with "Try a wider distance" (opens the distance question) / "Get food ideas by type" —
      the search is never widened for the person. Being shown writes no feedback. A request whose
      browser has gone away no longer stores a session (it could be restored over a newer one).
      (2) *"Change" after a typed sentence opened the questions.* Now a sentence decision's Change
      returns to the sentence box with the original text (in page memory only — no database, log or
      analytics), editable and sent like a new one; a questions decision keeps the original Change;
      tapping one item in "What I understood" opens just that question; "Edit details" opens the
      questions from the first. Editing fields makes it a step-by-step decision. Not real-nearby
      verified: the browser checks used a stand-in that mimics the server rule; the real route's
      exclusion is tested against the real route code with a fake Places provider.
      *Same weakness, not changed (not asked):* Cook / Get food-by-type / Snack "more" still pass only
      the last batch to the model as things to avoid.

Not done, on purpose: native app, Plan/Groceries contents, open-ended chat, training load,
persisting today's food, in-app voice, third-party analytics, a real deployment.
**Still the open question** (proof steps 1–2): does anyone, including the founder, use it
repeatedly and eat the pick? Nothing in this pass answers that.

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
- [~] **Hard dietary constraints (foundation)** — **partly done 2026-09-30 (Profile v2):** Allergies field + hard constraint in all four modes, dislikes soft everywhere. **Still open:** dietary restrictions (vegetarian/halal/…), and an alias-aware allergen check (a literal one exists in code for every mode since 2026-10-05). Original scope (added 2026-09-29): a small
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
- [ ] **Founder self-use for at least 7 days** — proof step 1 in `PRODUCT.md`. A
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
- **Lightweight behavioral hints (preference learning v0)** — built
  2026-09-30 at the founder's explicit request (promoting the minimal slice of
  "basic preference learning" above while NOW is unfinished); unvalidated. A
  per-request, unstored summary of recent *chosen* meals is passed to the
  recommender as its lowest-priority context: recent dish titles for variety,
  plus a tentative "often picks the easiest option" (cook/order) or "often
  chooses <category>" (Eat nearby) lean, each needing enough history across
  separate days, scoped per mode. No schema change, no UI. **Known gap:** the
  "see and reset inferred memory" requirement (PERSONALIZATION.md principle 7)
  is not met — deferred at the founder's request. See PERSONALIZATION.md.
- **Profile v2 — explicit nutrition personalization** — built 2026-09-30 at the
  founder's explicit request, unvalidated; needs the `schema.sql` migration
  (ALTERs) run **before** deploying. Allergies and dislikes as separate lists;
  optional age/sex/height/weight/activity inputs (metric storage, US-unit
  form); Mifflin–St Jeor maintenance estimate, a modest goal-based calorie
  suggestion and a g/kg protein suggestion, shown as estimates with manual
  overrides; fed into the recommender as the existing soft guidance. Not meal
  logging, not weight history. Details: `PERSONALIZATION.md`.
- **Health & nutrition priorities** — built 2026-09-30 at the founder's
  explicit request, unvalidated; needs the two-column `schema.sql` ALTER run
  before deploy. Optional, separate lists: three health conditions (context
  only, never sent to the recommender) and three user-confirmed nutrition
  priorities (lower sodium / limit added sugar / lower saturated fat) that
  reach all four recommendation modes as strong — not hard — guidance. A
  condition only *suggests* a priority; the user confirms. Cook/Order/Snack
  cards gain an optional one-line "Watch" caution. No nutrient numbers, no
  dashboard, no other conditions. See `PERSONALIZATION.md`.
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
  **Addition, 2026-09-30 (at the founder's explicit request): "Not for me"
  place feedback.** Explicit, per-user, per-place memory in a new
  `place_feedback` table (provider place id, reason, derived action). Hard
  reasons (closed, don't like, bad experience) exclude the place for that user
  until undone; soft ones (too expensive, other) only lower its feasibility
  score. Personal opinion only — never shown to others or treated as fact
  about the place; a skipped card or "Show me 3 more" records nothing. Built:
  the card control with inline Undo. Not built: a list to review/reset
  exclusions later, decay of soft feedback, any sharing across users.
- **Saved (recipes + places)** — promoted at the founder's explicit request,
  2026-09-30 (it was listed above as Extended MVP "Saved recipes" / "Favorites"
  and had not been promoted). New Saved tab (`/saved`, Recipes | Places);
  a bookmark on Cook recipe cards and nearby place cards; `saved_recipes`
  (canonical recommendation, keyed by a content hash) and `saved_places`
  (keyed by provider place id) tables. A saved recipe is shown unchanged with a
  warning if the *current* Profile now conflicts (literal allergy match; light
  note for dislikes); saved place guidance is withheld if it now names an
  allergen. A hard "not for me" removes the place from Saved. **Saved is
  interest only and is not used by ranking** (distinct from Picked / Ate /
  Loved). Not built: folders, tags, search, re-checking a place's current
  business status, nutrition-priority re-checks, using Saved in ranking.
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
- Basic product analytics — **minimal slice built 2026-11-07** (six first-party events + `supabase/metrics.sql`; see "Done — web beta pass"). Not a dashboard, not third-party tracking.
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
- **Natural-language entry ("What's going on?")** — promoted 2026-10-21 at the
  founder's explicit request, from `LEARNINGS.md` → "Post-CrossFit dinner that
  never got decided". **Status 2026-11-07: text entry built, unvalidated —
  training load deliberately NOT built; voice = phone-keyboard dictation only.**
  A hypothesis: a tired user will say their situation in one sentence when they
  would not answer a sequence of questions. (Details and what was tested: "Done —
  web beta pass" below. The bullets that follow are the original scope, kept for
  the success test.)
  - Home gets one text/voice box above the existing mode choices. The server
    extracts the sentence into the **existing structured context** (mode,
    hunger, time, today's food, budget) plus one new per-request field,
    **training load** (none / light / hard).
  - At most one follow-up question, only when a field the decision needs is
    missing; otherwise straight to the three cards.
  - Reuses the existing pipeline unchanged: the same hard-constraint checks,
    output validation and exactly-3 contract. Extraction never invents today's
    food, never writes to the Profile, and is not stored beyond the decision
    session's context.
  - Not open-ended chat (`PRODUCT.md` guardrail 4): one input becomes a
    structured request; the model's reply is still the cards, never prose.
  - The current question flow stays as the structured fallback.
  - **Training load names its behavior change** (`PRODUCT.md` principle 9): a
    hard day sizes carbohydrate up and protein toward the upper end of the
    range; it is soft guidance and reorders nothing in the priority order.
  - **Success:** the founder decides with it ≥5 meals/week for 3 weeks,
    decision under 1 minute, more than 60 % of picks actually eaten.
    **Fails** if it is not opened more often than the current flow. Measured
    against the one-week Claude Project baseline in the same `LEARNINGS.md`
    entry, which runs first.
  - Not included: saving today's food between meals (open conflict in that
    `LEARNINGS.md` entry — the current rule stands until `PRODUCT.md`
    decides), free-form chat, wearables, inferring training load from
    history.

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
- **Personal decision model** (Stage 3) and **broader food intelligence**
  (Stage 4) — added 2026-10-05 as parked pointers to "Strategic stages" above.
  Stage 3 is rules-based, not a trained model. Neither is scheduled.
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
