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

### Saved is explicit interest, not behavior (2026-09-30)

Saving a recipe or place (`saved_recipes`, `saved_places`) is an **explicit,
durable "I want to come back to this"** — kept apart from the other signals:
**Saved** (interested / want to return) ≠ **Picked** (selected for this meal) ≠
**Ate / ordered** (confirmed behavior) ≠ **Loved** (strong explicit preference;
unbuilt). A save is never treated as "the user loves this", and **no ranking
reads it yet**; it may later become a positive soft signal only after separate
promotion, under the same rules as every other inferred/explicit signal (never
overriding a hard constraint). A hard "not for me" on a place outranks and
removes its save; soft downranking leaves it.

## Status — what exists today

| memory type | today |
|---|---|
| **Explicit** | **Built.** Food Profile and Kitchen staples in Me — including, since Profile v2 (2026-09-30), allergies, optional body inputs, and calculated (never stored) energy/protein estimates with manual overrides, plus optional health conditions and **confirmed nutrition priorities** (sodium / added sugar / saturated fat). Dietary restrictions (vegetarian, halal, …) are **not** built. |
| **Routine** | **Not built.** Hypothesis only. |
| **Behavioral** | **Minimal first slice built, unvalidated (2026-09-30).** Recent choices are read back as a lowest-priority, soft hint — see "Behavioral soft preferences, as built" below. Nothing is stored; no Me visibility/reset UI exists yet. |

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

## Three kinds of context, and the memory kinds beneath them

*Added 2026-10-05. A conceptual layer over the memory kinds defined below — it
changes no rule. The strategy is in `PRODUCT.md` → "Strategy"; the principle it
serves is "the more you use it, the less you should have to explain yourself."*

Every recommendation combines three layers. The memory kinds in the table
further down ("Seven kinds of 'remembered'") are *where each one lives*:

| layer | changes | built today | memory kinds (table below) |
|---|---|---|---|
| **Stable context** | rarely | **Built.** Allergies, dietary pattern, equipment, goal, targets, usual budget, Kitchen staples | #1–#5 — safety constraints, nutrition priorities, explicit preferences, health conditions (context only), calculated defaults |
| **Learned preferences** | inferred over repeated use | **Minimal.** Recent dishes (variety) and two tentative "leans"; nothing else | #8 behavioral soft preferences; later, inferred routines |
| **Momentary context** | every meal | **Built.** Hunger, time, mode, today's food, willingness to shop, craving, travel willingness | #6 remembered recent context (as pre-selected defaults) and #7 current session |

How they combine does not change: stable *hard* constraints sit outside the
ordering and always win; momentary context outranks learned preference; learned
preference is a weak, last-priority nudge (see "Which source wins a conflict"
below). A learned preference such as **price sensitivity** or **effort
tolerance** stays a *soft ranking nudge* — it never becomes a budget ceiling, a
time limit, or an equipment constraint, because those are feasibility limits
only the user sets.

### How input shrinks over time

The product should need fewer answers per decision as it learns — never more.
The ladder, in order of trust, and where each rung stands:

1. **Last-used answers pre-selected** — *built* (remembered recent context; a
   mode already used opens on its own screen: last answers, **Edit**, one CTA).
2. **User-set routine defaults** (weekday lunch / dinner / weekend) — *NEXT,
   unbuilt.*
3. **Inferred routines, offered with one tap, never applied silently** —
   *LATER, unbuilt.*

Shrinking input means **pre-filling, not assuming.** A pre-filled value is shown
and editable in one tap, and the current moment always beats a routine. It must
never mean quietly dropping a question whose answer the user cannot see.

### Remembered is not true forever

Persistent context can go stale, and stale context is worse than asking. This is
the lesson behind retiring the general "pantry" (a once-entered, perishable item
assumed available forever — `CLAUDE.md` → "Kitchen staples vs. today's food").
Anything persisted must be visible, correctable, and — where it describes a
changing situation rather than a stable fact — either expire or be asked fresh.

### Stored fields must change a recommendation

`PRODUCT.md` principle 9: a Profile field earns its place only by changing what
is recommended. What each field does today (read from
`src/lib/recommend/input.ts` on 2026-10-05; re-verify before relying on it):

| stored | effect today |
|---|---|
| Allergies · dietary pattern | **Hard constraint** in all four modes (prompt-level; plus literal word checks — allergen names on every mode's food fields, dietary pattern on Cook recipe text; not a safety guarantee) |
| Foods I dislike | **Soft** strong penalty in all four modes |
| Confirmed nutrition priorities | Strong guidance in all four modes |
| Goal · protein target · energy guidance (manual, or calculated from body inputs) | Meal-size and protein guidance in all four modes; cards re-scored when targets change |
| Preferred cuisines | Tiebreaker in Cook, Order and Eat nearby — **not** read by Snack |
| Equipment | Hard constraint in Cook only (never assumed; unknown = no appliance) |
| Cook budget · fridge size | Cook only |
| Kitchen staples | Cook availability (`todaysFoods + kitchenStaples`) |
| Body inputs (age, sex, height, weight, activity) | Only to **calculate** targets; never sent to the model directly |
| Health conditions | **Context only — deliberately not sent** (they may *suggest* a nutrition priority in the UI) |
| Saved recipes and places | **Not read by any ranking** (interest only) |

The last two rows are the intentional exceptions to principle 9, not oversights.
Any other field found changing nothing should be wired in or removed.

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

## Eight kinds of "remembered" — keep them apart

Code, prompts, and docs must not blur these. Numbered by authority, highest
first:

| # | kind | examples | where it lives | how it is used | who changes it |
|---|---|---|---|---|---|
| 1 | **Safety constraints** (hard) | **Allergies** | `profiles.allergies` (Me → Allergies) | A **hard, non-negotiable exclusion in every mode**, never relaxed to reach three. The product never claims a result is "safe" or "allergen-free" | Only the user. Never inferred, never merged with dislikes |
| 2 | **Confirmed nutrition priorities** (strong guidance) | Lower sodium · limit added sugar · lower saturated fat | `profiles.nutrition_priorities` (Me → Health & nutrition priorities) | **Strong guidance, not a hard constraint.** Shapes *how* food is chosen and prepared (sauce on the side, leaner protein); never stated as an amount or a medical claim. Outranks dislikes, context, targets, and behavior; never outranks an allergy | Only the user — including confirming a suggestion |
| 3 | **Explicit Profile preferences** (soft) | **Foods I dislike**, cuisines, equipment, budget, cook minutes; **manually entered targets**; dietary preferences *(restrictions not built yet)* | `profiles` (+ `kitchen_staples`) | Constraints and soft preferences in the prompt. Dislikes are a very strong *soft* penalty, never a safety rule. A manual target always beats a calculated one | Only the user |
| 4 | **Health conditions** (optional context) | High blood pressure · prediabetes/diabetes · high cholesterol | `profiles.health_conditions` | **Context only — never sent to the recommender.** A condition may *suggest* a priority in the Profile UI; it does not enable one and drives no diet logic | Only the user. Never inferred |
| 5 | **Calculated Profile defaults** (guidance) | BMR, maintenance energy (TDEE), suggested calorie/protein target and range | **Not stored** — recomputed from explicit inputs by `nutrition.ts` | Shown in Me as estimates; used by the recommender as calorie/protein *guidance* (not exact requirements) only when there's no manual target and every input exists. No input → no estimate | Nobody directly; never overwrites a manual value |
| 6 | **Remembered recent context** | Hunger, effort, budget override, Order method / meal budget, Eat nearby travel | Derived on each visit from recent `decision_sessions.context` (`rememberedDefaults.ts`) | Pre-selected form values only. Editable; not a preference about food | Overwritten by the next successful generate |
| 7 | **Current meal / session state** (temporary) | Craving, foods on hand, "Use what I have", active recommendations and selection | The form and the latest `decision_sessions` row, auto-restored only within 6 hours | The request itself. Never becomes long-term memory | Expires (6 h); rows kept as history, not restored |
| 8 | **Behavioral soft preferences** (weak, inferred) | "Often picks the easiest option", recent dishes (for variety) | Computed per request from `decision_sessions` + `meal_feedback`; not stored | The lowest-priority prompt context (below) | Recomputed from history |

(Rows 1–5 are long-term Profile data in Supabase — not local storage, not
`decision_sessions`. A craving, foods on hand, and the current session are
**never** promoted into remembered context or behavioral memory.)

### Which source wins a conflict

```
1. Allergy safety constraints            (hard)
2. Confirmed nutrition priorities        (strong guidance)
3. Explicit dislikes / preferences       (soft)
4. Current meal context                  (temporary)
5. Calorie / protein targets             (guidance)
6. Behavioral soft preferences           (weak hints)
```

This orders *sources of information*: a lower one never overrides a higher one,
and only the user can change 1–3. It is not a replacement for `PRODUCT.md` →
"Decision priority order", which remains canonical for how a single
recommendation trades off likelihood-of-eating, craving, feasibility, goal, and
protein — and in which a strong craving can outweigh a *soft* stated preference
such as a preferred cuisine. Nutrition priorities are applied *within* the food
the user wants (a lighter sauce, a leaner protein) rather than by replacing it.
Hard constraints (allergies, feasibility limits) sit outside both orderings.

### Hard vs. soft, at a glance

| | strength | notes |
|---|---|---|
| Allergies | **hard safety constraint** | never relaxed; no "safe" claims; the prompt, plus a literal allergen-name check in code on every mode's cards (no aliases, so not a guarantee) |
| Confirmed nutrition priorities | **strong guidance** | not a constraint; no amounts, no medical claims |
| Dislikes | **soft avoidance** | a very strong penalty, never a safety rule |
| Calorie / protein targets | **guidance** | soft envelope / range, not exact requirements |
| Behavioral preferences | **weak hints only** | lowest priority; never a filter |

### Conditions suggest priorities — they do not drive diet logic

A health condition is optional context. It may make the Profile *suggest* a
nutrition priority (high blood pressure → lower sodium, prediabetes/diabetes →
limit added sugar, high cholesterol → lower saturated fat), shown as "Based on
this, you may want to pay more attention to sodium" with a one-tap "Use it". The
suggestion is never applied silently, and deselecting a condition never removes
a priority the user confirmed. **The recommender reads confirmed priorities
only** — it is never told a condition, so no disease-specific logic (low
potassium for kidney disease, low-carb for diabetes, avoiding all dietary
cholesterol, …) exists or may be improvised. Only these three conditions and
three priorities are supported; anything else is dropped when read or saved.
The product makes no medical claims and does not handle complex medical
nutrition needs (CKD, dialysis, heart failure, liver disease, eating disorders,
pregnancy, …) — users with those follow their care team.

### Profile v2 — what is built

- **Allergies** (hard) and **Foods I dislike** (soft) are separate lists,
  normalized (whitespace, casing), de-duplicated, and kept disjoint — an entry
  in both is kept only as an allergy. No predefined taxonomy beyond a short chip
  list of common allergens. Existing users' *dislikes* are **not** reclassified
  as allergies — that would be inferring a safety fact; anyone who meant an
  allergy must add it under Allergies.
- **Body inputs** (age 18+, sex used for the equation, height, weight, activity
  level), optional, stored metric-only. The form shows US units by default.
- **Energy:** Mifflin–St Jeor BMR × activity factor (1.2 / 1.375 / 1.55 /
  1.725) = estimated maintenance. BMR is shown as "what your body uses at
  rest", never as a target. Suggested target, by goal, as a modest adjustment
  of maintenance: fat loss −15% (range −10 to −20%, floor 1,200 kcal female /
  1,500 male), maintain 0% (±5%), build muscle +10% (+5 to +15%); "Eat better"
  gets none ("no strict numbers").
- **Protein:** 1.0–1.4 g/kg (Eat better), 1.2–1.6 (maintain), 1.6–2.0 (fat
  loss, build muscle), targeting the middle/upper of each, rounded to 5 g.
- **Overrides:** a stored calorie or protein value *is* the manual override;
  null means "use the suggestion." Existing values are preserved as manual.
- **Recommender:** allergies are a hard constraint in all four modes
  (Cook, Order, Snack, Eat nearby); dislikes are soft everywhere (this changed
  Cook / Order / Snack, which previously treated dislikes as hard); the effective
  targets feed the existing calorie/protein guidance.
- **Allergen check in code (added 2026-10-05):** a literal allergen-name match on
  the food fields of Cook, Get food and Snack cards (the Nearby `look_for` check
  already existed). It deliberately errs toward rejecting — a "peanut-free"
  mention in the food itself counts — and a rejected set gets one automatic retry
  with the finding fed back. No aliases or hidden-ingredient knowledge, so an
  empty result never means "safe".
- **Not built:** dietary restrictions beyond the pattern; reclassifying old
  dislikes; any tracking of weight over time.

## Behavioral soft preferences, as built

Hypothesis, not validated. Rules-based counting, readable in one file
(`src/lib/recommend/behavior.ts`):

- **Reads** only what the data explicitly represents: the chosen card's `role`,
  `title`, and (Eat nearby) provider `category`, plus whether the user recorded
  *not* eating it. There is no cuisine, protein, or effort field on a
  recommendation, so none is inferred. `ingredients_on_hand` and craving are
  never read.
- **Bounded:** chosen sessions from the last 60 days, the newest 25 meaningful
  ones. A picked meal the user recorded as not eaten is not counted (ambiguous →
  circumstance).
- **Scoped per mode** — cook, order, snack, and Eat nearby are separate; nothing
  crosses.
- **Sparse → nothing.** Fewer than 4 meaningful choices, or choices on fewer than
  2 days, yields no hints at all.
- **Two outputs only:** `recent_choices` (titles, *variety only* — avoid
  re-offering the same dish; never a taste signal; not for Eat nearby) and
  `leans` (at most: "often picks the easiest option" for cook/order; "often
  chooses <category> places" for Eat nearby — each needing ≥3 picks on ≥2 days
  and a majority of the window). Snack has no effort lean: there,
  `lowest_effort` means "more indulgent."
- **Prompt:** a last-priority section stating that everything else outranks it,
  that it is never a constraint or filter, never to infer dislikes from
  non-selection, to preserve variety, and never to mention the history to the
  user.
- **Not done:** eaten-vs-picked weighting, taste-reason negatives, decay within
  the window, cuisine/protein tagging, and the see-and-reset surface required by
  principle 7. The last is a known open gap — it was deferred at the founder's
  request, and the hint is deliberately weak and unstored until it exists.

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

### Candidate signals named by the strategy (2026-10-05)

`PRODUCT.md` → "What the loop may learn from" lists signals the compounding loop
could eventually use. **This table says what each is *allowed to mean*; it
authorizes recording none of them** — `PLAN.md` does that. Where a row says
"context", it falls under principle 3 and rule 7: when unsure whether a signal
was taste or circumstance, treat it as circumstance.

| signal | allowed to mean | never allowed to mean | status |
|---|---|---|---|
| Options **shown** | nothing | any dislike (principle 2) | shown sets are stored with the session; no signal drawn |
| Option **opened** (View recipe / More) | browsing; at most a very weak interest hint | dislike of the unopened ones; a pick | not used; browsing records nothing |
| **Saved** | explicit "come back to this" | love, a pick, or an ate-it | built; read by no ranking |
| **Accepted** (picked) | weak positive: intent | a lasting preference (principle 1) | built |
| **Actually eaten** | strongest positive; still one event | a permanent preference | built (core loop) |
| **Rejected** with a *taste* reason | weak, decaying negative; stronger only if repeated across days | an exclusion | place "Not for me" built; general case not |
| **Not in the mood** · **too much effort** | context for *this* moment; may inform effort tolerance as a context-scoped soft lean | a taste negative | not built as a general signal |
| **Too expensive** · **too far** | context; may inform price sensitivity / travel willingness as a soft lean | a budget ceiling or distance limit (those are set by the user) | "too expensive" built for places only |
| **Not available** | context (the option wasn't real) | a taste negative; reason to hide a real place for good | place "closed" built (hard exclusion for that user) |
| **Already ate this recently** | variety: don't re-offer soon | a taste negative | partly built (recent dishes as a variety hint) |
| **Substitution** | weak ingredient-level hint, *only if repeated*; ambiguous alone — may be availability, not taste | a dislike of the swapped-out food | not built |
| **Repeat choices** | strong positive after repetition across days; candidate for one-tap "add to favorites" | silent rewrite of the Profile | not built beyond the variety hint |
| **Preferred restaurants / cuisines**, **typical weekday or post-workout behavior**, **time-of-day and budget patterns** | tentative inferred patterns, **context-scoped**, subject to the confidence rules below | a hard constraint; a filter | not built; inferred routines are LATER |

Any of these that becomes an *inferred* belief that materially changes
recommendations must ship with see / edit / reset (principle 7). Allergies,
dietary restrictions, medical conditions and body metrics are never on this list
— they are never inferred (principle 9).

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
  *Bounded exception (founder decision, 2026-09-30, UX V2):* a single
  first-run setup for a user whose Profile is empty — three short, skippable
  screens of **explicit** safety-relevant fields that already exist on Me
  (allergies, dietary pattern, foods you don't eat). A lightweight
  "What can you cook with?" is asked once, the first time someone cooks — never
  in global setup. Goal and body inputs are not part of it;
  they are offered once, as a dismissible card after the user's first results
  (UX V3, 2026-10-01). Each is offered once (finishing or skipping both record
  it), never blocks using the app, never infers anything, and never returns as
  a "complete your profile" nag.
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
