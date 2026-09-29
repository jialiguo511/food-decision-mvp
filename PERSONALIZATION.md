# PERSONALIZATION.md — How the product remembers and learns

Design intent for long-term personalization. It describes *what kinds of
memory exist and the rules for learning*, not the implementation. For why the
product exists, see `PRODUCT.md`. For what is being built and when, see
`PLAN.md` — this file authorizes nothing by itself. For implementation rules,
see `CLAUDE.md`.

Authority: subordinate to `PRODUCT.md` and `PLAN.md`. If this file describes a
capability that `PLAN.md` has not promoted into NOW or NEXT, it is a **possible
future idea** and must not be built.

---

## Status — what exists today

| memory type | today |
|---|---|
| **Explicit** | **Built.** Food Profile and Kitchen staples in Me. |
| **Routine** | **Not built.** Hypothesis only. |
| **Behavioral** | **Not built.** The core loop already *records* selections and actual-eaten feedback (`decision_sessions`, `meal_feedback`), but nothing reads them back into recommendations. |

Everything below the explicit layer is a **current hypothesis**: we believe
it, nothing here is validated with users. Do not describe it to users, or in
code comments, as if it were proven.

---

## The purpose

Personalization exists to raise one number: **how often a recommendation is
actually eaten.** It serves the decision priority order defined in
`PRODUCT.md` → Product principles (it does not restate it). It is not a goal in
itself, and "we know a lot about you" is not a feature.

It must never add decisions for the user. The user should not manage,
review, or tune what the product has learned as a routine chore. Learning is
absorbed silently where it is safe and surfaced with one tap where it is not.

---

## Core principles

**1. One choice does not establish a permanent preference.**
Picking a Thai curry once is one data point about one evening — it may have
been a craving, a leftover ingredient, or the least-bad option. A single
selection, or a single meal eaten, never creates a lasting preference.

**2. Non-selection does not equal dislike.**
Each time the product shows three options, two are not picked. That is not a
verdict on those two. The user may have been tired, short on time, or simply
had to pick one. Recommendations that were shown and not chosen carry **no
negative signal**. Regenerating ("Show me 3 more") says "none of these fit
right now," not "I dislike all three."

**3. Only stated dislikes and clear taste-based rejections count against
a food.** A rejection reason of "too much effort", "no time", "wasn't hungry",
or "changed my mind" is *context*, not taste, and does not lower the food's
standing. Only an explicit taste reason ("don't like it") is a negative
signal, and even then it is a weak, decaying one until repeated.

**4. Explicit outranks inferred — in a specific hierarchy.**
Behavior improves ranking over time; it does not blindly override what the
user told us. What counts as a *hard constraint* versus a *soft preference* is
defined once, in `PRODUCT.md` → "Hard constraints vs. soft preferences." This
file only says how learning interacts with them. The precedence, highest first:

1. **Hard constraints** — allergies, dietary restrictions, other
   safety-related exclusions, and feasibility limits. **Never overridden by
   inferred behavior, at any confidence.** Behavior also never *creates* one,
   and never relaxes one.
2. **Soft explicit preferences** — cuisine preferences, disliked foods,
   preferred ingredients, taste leanings. These *start at higher confidence
   than any inferred preference*, because the user said them. Repeated,
   consistent behavioral evidence may **gradually adjust their ranking
   weight** — e.g. a stated love of a cuisine the user has not eaten in two
   months slowly counts for less in ranking — but never eliminates them.
   Disliked foods are soft: a very strong penalty, but not a safety
   constraint and not equivalent to an allergy or restriction.
3. **Inferred preferences** — learned from behavior; lowest starting
   confidence, rules in "Confidence and learning rules" below.

**Behavioral inference never silently rewrites an explicit Profile field.**
The stored value in Me changes only when the user changes it — at most after a
one-tap suggestion the user accepts. The *ranking weight* applied to a soft
stated preference may drift; the *stated preference itself* does not.

**5. Learning is a soft preference, never a filter.**
Learned signals adjust *ranking among feasible options*. They never remove the
three-option contract, never shrink the set of cuisines the product will
suggest, and never make the `alternative` recommendation less different. The
product must be able to surprise the user; a recommendation set that only
mirrors past behavior is a failure mode, not a success.

**6. What the user actually ate outweighs what they picked, which outweighs
what they were shown.** See the signal table below.

**7. Inferred memory is visible, correctable, and reversible.**
Anything the product concludes about a user (as opposed to being told) must be
shown in Me if it materially changes recommendations, editable in one tap, and
resettable as a whole. This is a precondition for shipping any inferred
memory — not a follow-up.

**8. Be honest about how little is known.** With no history, use explicit
memory and defaults only. Do not fake familiarity ("based on your habits…")
before there are habits. Cold start is a normal, supported state.

**9. Do not infer sensitive attributes.** Never infer dietary restrictions,
allergies, medical conditions, religion, or body metrics from behavior. Those
are hard constraints (principle 4) and are explicit-only. (Picking three
vegetarian meals does not make someone vegetarian.) The Profile field for hard
constraints is a NOW foundation item in `PLAN.md`; until it exists, the
product must simply never *guess* these.

---

## The three memory types

### 1. Explicit memory — what the user told us

Facts the user entered deliberately and can edit at any time.

- **Examples:** primary health goal, protein target, optional estimated daily
  energy guidance, normal food budget, hard constraints (allergies, dietary
  restrictions), cuisine preferences, disliked foods, kitchen equipment,
  fridge/storage limits, Kitchen staples.
- **Source:** the user, via Me. Never inferred, never silently changed —
  behavior may adjust a soft preference's ranking weight, never its stored
  value (principle 4).
- **Effect on recommendations:** two tiers, defined in `PRODUCT.md` → "Hard
  constraints vs. soft preferences." *Hard* constraints are non-negotiable in
  every mode. *Soft* preferences start at higher confidence than inferred ones
  and may be gradually re-weighted by repeated behavior.
- **Nutrition targets belong here and are recommendation context only.**
  Near-term guidance is limited to an **estimated daily energy range** and a
  **protein target/range** — nothing else, and no estimate is fabricated when
  the required Profile inputs are missing (see `PRODUCT.md` → Nutrition target
  refinement). They are estimates the user can accept or edit that shape meal
  size — not a budget, a score, or a log. Carbohydrate and fat targets are not
  part of near-term personalization.
- **Not explicit memory:** *today's foods.* What the user has right now is
  entered fresh each time and never persisted — see `CLAUDE.md` → Kitchen
  staples vs. today's food. Personalization must not become a back door for a
  persisted pantry.
- **Status:** built.

### 2. Routine memory — how the user's days usually look

Default *contexts*, not preferences about food. Different parts of the week
plausibly have different starting points:

| routine slot | why it likely differs |
|---|---|
| **Weekday lunch** | short time, low effort, often near work; may lean toward order or grab |
| **Weekday dinner** | more time and energy variance; the main cooking opportunity |
| **Weekend** | more time, more appetite for cooking or eating out, different pace |

(These three are the starting slots. Breakfast, snacks, and finer splits —
e.g. Friday night versus Sunday — are not modeled until there is evidence they
matter. Slot boundaries by clock time are an open question.)

- **What a routine holds:** default values for Today context — decision mode
  lean (cook / order / snack), time available, desired effort, budget feel,
  hunger. Nothing about specific dishes.
- **How it is used:** as **pre-selected defaults** on Today, so the user can
  often hit "Find my meal" with zero changes — the "smart default instead of a
  question" rule in `CLAUDE.md`. A routine default is always visible and
  overridable in one tap. It is never a hidden constraint.
- **How it is set, in order of trust:**
  1. *User-set* — an explicit "make this my usual for weekday lunch" action.
     Lowest risk; this is the first version.
  2. *Inferred with confirmation* — after repeated consistent context
     (see confidence rules), the product offers one-tap "Make this your usual?"
     It never applies an inferred routine silently.
- **Routines never override the current moment.** If today's context differs,
  today's context wins and the deviation is weak evidence, not a correction
  of the routine.
- **Status:** hypothesis. User-set routine defaults are a NEXT candidate in
  `PLAN.md`; inferred routines are LATER.

### 3. Behavioral memory — what the user actually does

Observations from the core loop, used only to adjust *soft ranking*.

- **Signals:** selected · actually eaten · not eaten (with reason) · rejected
  · regenerated · repeated · how recently.
- **Uses, roughly in order of how safe they are:**
  1. **Recent-meal awareness** — don't serve the same dish or protein three
     days running; allow deliberate repeats of things the user keeps eating.
     (Safe, nearly stateless.)
  2. **Soft affinity** — mild lean toward cuisines, proteins, and effort levels
     the user *eats* in a given context.
  3. **Context-specific acceptance** — e.g. quick meals get eaten on weekday
     lunches but skipped on weekends.
- **Source:** the user's own recorded behavior only. No other users' data, no
  external data, no cross-user learning — the product has no social or
  community layer.
- **Method:** simple counting with recency decay, rules the founder can read.
  **Not** a trained model and **not** a vector store — both are current
  non-goals. Behavioral memory is a rules-based adjustment to the prompt
  context or a later ranking step, nothing more.
- **Status:** the recording side is part of the NOW core loop. Reading it
  back is NEXT (basic preference learning, recent-meal awareness); anything
  beyond that is LATER.

---

## Signal strength

How much each observation is allowed to move the product's belief. Direction
and rough size, not weights to implement.

| observation | signal about the food | notes |
|---|---|---|
| Shown, not picked | **none** | Principle 2. |
| Regenerated ("3 more") | **none** for any item | Says the set missed, not why. |
| Picked | **weak positive** | Intent, not outcome. |
| Picked and **actually eaten** | **positive** — the strongest signal we get | Still one event (principle 1). |
| Picked, **not eaten**, reason is context (effort, time, not hungry, changed mind) | **none** about taste; may inform routine/context | Do not punish the food for a bad evening. |
| Picked, not eaten, reason is **taste** | **weak negative**, decaying | Repeated across days it strengthens. |
| Explicit dislike added in Me | **hard exclusion** | Explicit memory, not learning. |
| Same food eaten repeatedly across days | **strong positive** | Candidate for one-tap "add to favorites". |
| Any single event, of any kind | **never sufficient alone** to change ranking materially | Principle 1. |

Feedback-reason vocabulary belongs to the feedback UI, which is NOW work; it
should be built so that context reasons and taste reasons are distinguishable,
because this table depends on it.

---

## Confidence and learning rules

These are **starting values to tune with real use**, not validated numbers.

**Confidence levels.** Every inferred belief sits at one of:

| level | meaning | allowed to do |
|---|---|---|
| **none** | zero or one observation | nothing |
| **tentative** | a pattern repeated on at least ~3 separate occasions across at least ~2 different days | a small nudge to ranking; never stated as fact to the user |
| **established** | consistent over a longer window with no recent contradiction | a stronger nudge; may prompt a one-tap "make this explicit?" |

**Rules:**

1. **Repetition across days, not within one.** Three picks in one evening's
   regenerations are one occasion.
2. **Context-scoped.** A pattern learned for weekday lunch is not assumed to
   hold for weekend dinner, and a pattern learned for Cook is not assumed for
   Order. It generalizes only after appearing in the new scope too.
3. **Decay.** Evidence ages out. A habit not seen for weeks fades back toward
   *none*; tastes and routines change.
4. **Contradiction moves faster than confirmation.** A recent clear
   contradiction drops confidence a level; confirmation raises it slowly.
5. **Promotion to explicit is the user's call.** Only ever offered with one
   tap, only at *established*, and rarely. Declining is remembered so it is not
   asked again soon.
6. **Learning never reduces exploration.** The `alternative` slot stays
   meaningfully different regardless of confidence.
7. **No learning from a weak or ambiguous signal at all.** When unsure
   whether an observation was taste or circumstance, treat it as circumstance.
8. **Everything can be undone.** One action resets all inferred memory without
   touching explicit memory (principle 7).
9. **Stated soft preferences start high and drift slowly.** A soft explicit
   preference begins at *established*-level weight, above any inferred belief.
   It loses weight only under sustained, consistent contrary behavior across
   many days (rules 1–4 apply), never drops to zero, and never changes the
   stored Profile value. Hard explicit constraints are outside this scheme
   entirely — no amount of behavior moves them.

---

## What personalization must not become

- A **profile-completion quiz** or onboarding interrogation. Preferences are
  learned from use where safe; the user is not asked to describe themselves.
- A **settings burden.** If a learned thing needs the user to tune it, the
  design has failed.
- A **black box.** Rules must be explainable in one sentence ("you've eaten
  quick chicken meals on most weekday lunches").
- A **trained recommendation model, vector database, or autonomous agent** —
  all current non-goals.
- A **filter bubble** — see principle 5.
- **Surveillance.** Precise location is not stored by default (see
  `PRODUCT.md` → Location-aware recommendations); behavior stays with the
  user's own account and is used only for that user's recommendations.

---

## How this maps to the roadmap

| capability | placement in `PLAN.md` |
|---|---|
| Explicit memory (Profile, Kitchen staples, targets) | NOW — built |
| Recording selection and actual-eaten feedback | NOW |
| Hard constraints (allergies, dietary restrictions) in the Profile | NOW — foundation; prerequisite for Eat out personalization |
| Recent meals (repetition awareness), basic preference learning | NEXT |
| User-set routine defaults (weekday lunch / dinner / weekend) | NEXT |
| Inferred routines, inferred-preference confirmation, reset-learned-memory UI | LATER |
| Structured ranking using `historical_acceptance` | LATER |

Note the coupling: reading behavioral memory back into recommendations
requires the visibility and reset affordance from principle 7. Do not ship
one without the other.

---

## Open questions

- Clock-time boundaries for weekday lunch / weekday dinner / weekend, and
  whether time zones or shift work break the model.
- Whether user-set routine defaults are used enough to justify inference at
  all — this may be answered by usage of the first version.
- The right size of the "not eaten" reason vocabulary: enough to separate
  context from taste, few enough to stay one tap.
- Whether recent-meal awareness alone captures most of the value before any
  affinity learning is built.

Record evidence bearing on any of these in `LEARNINGS.md`. Until then, none of
the confidence numbers above are findings.
