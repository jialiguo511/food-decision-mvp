# PRODUCT.md — Food Decision

The canonical product document for this repository. It describes the problem
and the strategy, not the implementation. For how to build, see `CLAUDE.md`.
For what to build next, see `PLAN.md` (including its four strategic stages).
For how the product remembers and learns about a user, see
`PERSONALIZATION.md`. For what the product is today versus where it is
headed, see "Strategy — the wedge and the long-term product" below.

---

## Product thesis

Eating well is often not primarily an information problem.

People usually know roughly what healthier eating looks like. The harder
problem is deciding what to actually eat under changing real-world
constraints:

- time
- energy
- hunger
- current craving
- food budget
- ingredients already available
- kitchen equipment
- fridge / storage limitations
- cultural food preferences
- health and body-composition goals

When that decision becomes too cognitively expensive, people default to
whatever is easiest: takeout, nearby convenience food, repetitive low-quality
meals, or skipping meal planning entirely.

Food Decision exists to reduce that cognitive load. The question it answers is:

> **Given my life right now, what is the easiest food decision I will actually
> follow through on while still moving toward my health goals?**

This is not a generic recipe app, and not primarily a calorie tracker.

---

## Strategy — the wedge and the long-term product

*Added 2026-10-05. Strategy and direction only — nothing in this section
authorizes building anything. What is built and scheduled lives in `PLAN.md`.
Everything described here as long-term is a **current hypothesis or a possible
future idea**, not validated behavior; the "Status" columns below say which.*

### Wedge versus long-term product

| | what it is | status |
|---|---|---|
| **Wedge** | **Fast next-meal decision support** — "help me decide what to eat right now" under the constraints the person actually has. | Built. This is what the first users test. |
| **Long-term product** | **A personalized food decision system that learns how one specific person actually eats** and gets progressively better at answering: *given who I am, what I have, where I am, what I have eaten, what I want, and what constraints I have right now, what is the best realistic thing for me to eat next?* | Hypothesis. Only the explicit layer and one minimal behavioral slice exist. |

The wedge is real value. The decision recurs several times a day and is made
under pressure: hungry, short on time, maybe unwilling to cook, maybe with
ingredients on hand or willing to buy a few things, maybe wanting delivery,
pickup or something nearby — with a budget, nutrition goals, allergies and foods
to avoid, and a mood (tired, craving something, just finished exercising).

But the product must **not be defined** as:

> user answers a few questions → an LLM generates 3 meal recommendations

That is easy to reproduce and weak as a standalone product. The wedge is how the
product earns its first uses; the long-term product is what makes the *tenth*
use better than the first. The order matters: the wedge has to be reliably
good before any long-term layer is worth building (`PLAN.md` → Stage 1), and the
long-term layer is only worth building if the wedge is used repeatedly.

The product **reduces repeated food decision-making.** It does not become
another calorie-tracking app (see guardrails). Its core behavior is
**decision → action**, not *record → analyze → dashboard*.

### The compounding loop (hypothesis)

```
context → recommendation → choice → feedback
        → better model of the user → better future recommendation
```

Each meal decision should leave behind something that makes the next one faster
or better. This feedback loop is a **potential source of defensibility**: a
competitor can copy a prompt, but not a person's accumulated, structured
history. That is a hypothesis, not a finding — nothing yet shows that behavior
can improve recommendations enough to matter, or that users stay long enough to
build up history.

The loop is a *direction*, not a description of today's product. The
signals it may eventually learn from are listed under "What the loop may
learn from"; what each one is *allowed to mean* is defined in
`PERSONALIZATION.md`. The loop never breaks these rules: it asks for no heavy
manual logging, it keeps hard constraints out of reach of inference, it is
rules-based (no trained recommendation model, no vector database — current
non-goals), and it never turns the core loop into a tracking system.

### Why not just ask ChatGPT?

Not because our prompts are better — a general assistant can match them, and
the answer must not depend on that.

The difference should come from **persistent structured context and decision
history**. With a general chatbot the user explains the situation again every
time. This product should already know it:

| a chatbot has to be told again… | what this product holds | status (2026-10-05) |
|---|---|---|
| "I don't have an oven" | kitchen equipment, never assumed | **Built** (asked the first time they cook; editable in Me) |
| allergies, foods I avoid, dietary pattern | hard constraints and soft dislikes, kept separate | **Built** |
| my goal and protein / energy guidance | nutrition targets as recommendation context | **Built** |
| my usual budget; how much I'll spend on a meal | explicit Profile budget, plus the last-used answers | **Built** |
| what's in my kitchen | **Kitchen staples only** (condiments and seasonings). *Today's food is deliberately not remembered — it is asked fresh each time* ("Kitchen staples vs. today's food", `CLAUDE.md`) | Staples **built**; no persisted inventory, by design |
| what's nearby and how far I'll go | real nearby places and a travel-willingness answer | **Built** |
| what I ate recently | recent choices, read back as a weak variety hint | **Minimal** (v0) |
| places I saved | Saved recipes and places | **Built**; not read by any ranking |
| what I keep rejecting | repeated rejections and their reasons | **Partial** (place "Not for me"); no general learning |
| my usual weekday constraints; "high protein after training" | routine defaults, later inferred routines | **Not built** (user-set routines NEXT; inferred routines LATER) |

Be honest about the present: **today the gap against a well-prompted chatbot is
small.** The product's current edge is convenience and grounding — fewer taps,
structured output, real nearby places, constraint checks — not a deep model of
the user. The differentiation above is the thing being built toward, and it
must be earned and measured, not asserted.

**Principle:** *the more you use it, the less you should have to explain
yourself.* The product should require less input over time, not more. If a
feature adds questions without ever removing one, it works against the strategy.

### Three kinds of context, combined on every decision

| layer | how often it changes | examples |
|---|---|---|
| **Stable context** | rarely | allergies · dietary restrictions · kitchen equipment · health / nutrition goals · usual budget range |
| **Learned preferences** | inferred over repeated use | cuisines · foods · restaurants · effort tolerance · price sensitivity · preferred meal size · common routines |
| **Momentary context** | every meal | hunger · time available · cook / order / snack · ingredients on hand · willingness to shop · craving · location and travel willingness |

The recommendation engine combines all three. Precedence is unchanged: stable
*hard* constraints sit outside the ordering and always win (see "Hard
constraints vs. soft preferences"); momentary context outranks learned
preference; learned preference is a soft, last-priority nudge. Today stable and
momentary context are built and learned preferences are minimal.
`PERSONALIZATION.md` maps these three layers onto the memory kinds it already
defines and lists which stored fields change a recommendation today.

### What the loop may learn from

A possible list, not a build list. None of these is authorized beyond what
`PLAN.md` has promoted, and **shown, opened, or not-picked never counts as a
dislike** (`PERSONALIZATION.md`, principle 2):

- **Behavior:** options shown · opened · saved · accepted (picked) · rejected ·
  repeated choices · what was actually eaten · substitutions
- **Reasons, as one-tap feedback:** not in the mood · too expensive · too far ·
  too much effort · not available · already ate this recently
- **Patterns, only after repetition across days:** preferred restaurants and
  cuisines · typical weekday behavior · typical post-workout behavior ·
  time-of-day and budget patterns

Kitchen constraints and nutrition goals are *stable context* the user states,
not something to infer from this list.

### Modes are interaction modes, not separate products

Cook, Eat out / order, and Grab a snack stay as the MVP's three entry choices
because they map to three immediate things the user can *do* — make food, get
food, grab something small — and each needs different follow-up questions and a
different shape of output. They are **interaction modes over one decision
system**: one Profile, one context model, one feedback loop, one learning layer.
(Learned patterns are scoped per mode until shown to generalize — a
`PERSONALIZATION.md` rule — which is a learning rule, not a separate product.)

The long-term direction is that the user states a situation and the product
works out the solution space. Example, **direction not built**:

> "I just finished CrossFit, I have 20 minutes, I'm very hungry, and I don't
> want to cook."

The product should answer within the right space — ready-to-eat or nearby food,
quick, protein-forward — rather than make the user reason through nutrition from
scratch. Today the user picks a mode first and the follow-up questions narrow
from there. **Built 2026-11-08 (founder-promoted, unvalidated):** when the person
does not limit themselves to ONE way — "I can buy or make", "you decide", "just
something" — the sentence entry makes one cross-way request ("open") and returns up
to three cards that may be a recipe, a food idea to order, or a snack to grab (see
"Cross-way ('open') decisions" below). The person's own choice always wins: a stated
single way ("only what I have", "I don't want to cook") is honoured as a limit, never
overridden. See also "Cook / assemble / buy" under Possible future directions.

---

## Cross-way ("open") decisions

*Built 2026-11-08 at the founder's explicit request, on `codex/web-beta`;
unvalidated. It resolves a conflict between this file's "Possible future directions →
Cook / assemble / buy" and a real input ("I can buy things or make something myself")
that the app answered with a forced single-mode question.*

A typed situation can be read three ways, and the product must tell them apart:

1. **One explicit way** — "only what I have", "something nearby", "a sweet snack".
   Treated as before: that mode, its own questions only for what it cannot go without.
2. **Open to several, or "you decide"** — "buy or make", "just something", "I don't
   care". One *open* request: the same three-card contract, but a card may be a recipe
   (**Make it**), something to order (**Order it**) or something to grab (**Grab it**).
   There is no question about "what kind of help".
3. **Not understood** — nothing usable was read. The existing "couldn't read that"
   path; the step-by-step entry stays available.

Rules for the open request:

- **One model call**, one schema whose slot may be any allowed way — never every
  mode's recommender run and stitched together (cost, latency, duplicated cards).
- **Still exactly three decisions**, still `best_match` / `lowest_effort` /
  `alternative`; each card keeps its own way's rules, save, choose and feedback.
- **Unknown is unknown.** No foods named → no ingredient is assumed on hand (only
  Kitchen staples). No location → no restaurant, store or price is named; buying
  suggestions are *types of food and what to look for*, and real nearby search stays
  its own mode that asks for location. Equipment never stated → no appliance is
  assumed (assembly-only). Time, effort and budget the person did not state are not
  invented and not enforced.
- **A stated limit is a hard constraint for the request**: "I don't want to cook" means
  not one recipe. Allergies, dietary pattern and equipment hold on every card of every way.
- **Self-reported context is not a measurement.** "I didn't get enough protein after
  my run" is kept as *wants protein* / *after exercise* and may tilt the options; the
  product never says or implies a verified shortfall, a deficiency, a number of grams
  missing, or a recovery claim, and never computes an intake gap.
- **Ask little.** An open request needs no clarifying screen. Where something is
  genuinely required (Cook needs a time and effort), only that is asked, with chips.

---

## Product identity and guardrails

Food Decision is a **context-aware food decision assistant.** Its one job:

> **Help me decide what to eat right now — and make future food decisions
> easier.**

It supports three **action domains**. They are three ways of solving that same
job, **not three products**; they share one profile, one personalization layer,
and one feedback loop.

- **Cook** — make something from available food, optionally buying a few
  missing ingredients.
- **Eat out** — find or choose realistic food outside the home.
- **Stock up** — prepare the food environment for the next few days without
  locking the user into a rigid meal schedule.

What is built, and what is scheduled, lives only in `PLAN.md`. The mapping of
today's built modes onto these domains is under "Three action domains" below.
How recommendations are shaped — the decision priority order, the exactly-3
rule, and the hard-constraint rule — is defined once, under "Product
principles."

### What the product must not drift into

These are identity-level guardrails, not phase-level scope. They are not
"later" — they are not this product. Changing any of them means changing this
document first.

- **A calorie tracker or macro diary.** The user never logs, counts, or
  reconciles what they ate. Calorie and protein numbers are *estimates that
  shape a recommendation*, not a running total the user manages. The one
  exception to "nothing to log" is the core-loop question "did you actually
  eat it?" — a success signal, not a diary entry.
- **A rigid meal planner.** No day-by-day schedule that assigns meals to
  dates and makes the user feel behind when life changes. The product's
  answer to "prepare for the next few days" is **flexible provisioning** —
  enough flexible food, with each actual meal still decided dynamically that
  day. (See "Stock up" below.)
- **A recipe database or discovery feed.** Three choices when deciding, not a
  browsable library. Saved recipes exist to make *future recommendations* better, not
  to be a collection to manage. (The Saved area is a deliberately small
  return-to list — see "Top-level product structure"; it is not a browsable
  library and has no organization features.)
- **A generic "AI nutrition coach."** No open-ended chat, no unsolicited
  nutrition lectures, no moralizing about food. The model returns structured
  decisions, not advice-giving prose. The Order Food coaching philosophy
  (harm reduction, craving first) applies to every mode. A one-sentence
  situation input ("What's going on?" — promoted to NEXT 2026-10-21, not
  built) is not open-ended chat: it is converted into the same structured
  request, and the answer is still the cards.

If a proposed feature makes the product feel more like one of these four, that
is a signal to stop and check it against the core loop, not a reason to
proceed carefully.

### The same guardrails, spelled out against the strategy

Added 2026-10-05 so the long-term "learns about you" direction cannot be read
as permission to drift. The product is **not primarily**, at this stage or as
the strategy unfolds:

- **calorie logging, macro tracking, or a food diary** — guardrail 1
- **weight logging** — *new.* Body inputs exist only to estimate targets: one
  current value, edited in Me. No weight history, trend, or chart.
- **a meal-planning calendar** — guardrail 2
- **generic recipe discovery** — guardrail 3
- **a grocery list manager** — *new.* Groceries, if built, holds **one**
  derived list (an execution artifact; see "Exactly 3"). No list organizing,
  editing workflows, or sharing.
- **nutrition education content** — guardrail 4
- **another chatbot interface** — guardrail 4

Nutrition data supports decisions; it is not the main job. The core behavior is
**decision → action**, not *record → analyze → dashboard*. The one logging-like
exception stays the core-loop question "did you actually eat it?".

---

## Initial user (the starting segment)

*(Earlier versions called this "the wedge". "Wedge" now means the capability —
fast next-meal decision support — defined under "Strategy"; this section is
about **who** to start with.)*

Start narrow. The initial target user is a **busy person living alone** who:

- wants to eat healthier
- exercises regularly
- often wants high-protein meals
- may be cutting fat, maintaining, or building muscle
- dislikes traditional meal planning
- may have limited kitchen equipment or storage
- frequently buys food because planning and deciding feels exhausting
- may prefer Asian and culturally familiar food over typical Western
  "healthy recipes"

The initial product should **not** try to serve every kind of eater.

---

## Core behavior

**Today, without the product:**

```
Need food → think about ingredients → think about cooking time
          → think about budget → think about nutrition
          → think about what sounds good
          → decision fatigue
          → buy whatever is easiest
```

**With the product:**

```
Need food → open Food Decision → provide minimal current context
          → receive exactly 3 realistic options
          → choose one → actually eat it
```

The framing is **"tell me your situation right now → I help you decide what
to eat,"** not "tell me your ingredients → I generate recipes." Cooking is
one important mode of that decision. It is not the whole product — one of
the highest-risk moments for this user is exactly when they *don't* want to
cook: hungry, tired, craving something, about to order delivery or default
to whatever's easiest. That moment is in scope too.

## Core product loop

```
Context → 3 options → choose → actually eat → feedback
        → better future recommendations
```

The real success event is **recommendation → actual eating.**
Generating recipes alone is not success.

## Three decision modes

The first thing the product asks is not "what's in your kitchen" — it's
**what kind of decision is this**:

- **I can cook** — the original flow. Ingredients, kitchen equipment, cook
  time, a recipe with steps.
- **I want to order food** — a lightweight decision-support flow for when
  cooking isn't happening tonight: hungry, tired, or just craving something.
  Recommendations are meal *categories* to search for in whatever delivery or
  takeout app the user already has — not recipes, not restaurant names.
- **Grab a snack** — for when the user wants something sweet, salty, or
  snack-sized right now and is willing to walk into a nearby grocery,
  convenience, or drug store, but isn't cooking or ordering a meal.
  Recommendations are specific, ready-to-buy items with guidance on what to
  look for in the store — not a recipe, not a delivery search term, and not
  dependent on any store's real inventory.

All three modes share the same profile, selection step, and actual-eating
feedback; only the dynamic context asked and the shape of what comes back
differ. See "Order Food" below for that mode's coaching philosophy — the same
craving-first, no-moralizing approach applies to Grab a Snack.

### Three action domains

The three decision modes above are what is built. They map onto the three
action domains defined under "Product identity":

| domain | today | direction |
|---|---|---|
| **Cook** | "I can cook" (use what I have / buy a few things) | One missing-ingredient list; nearby-grocery handoff (future) |
| **Eat out** | "I want to order food" (meal categories) and "Grab a snack" | Nearby restaurant/café discovery + contextual ranking |
| **Stock up** | Not built | Flexible provisioning — "Stock me for N days" |

**Home structure — a decision.** Home stays simple. Nearby restaurants do
**not** get their own new top-level Home intent, and are not a new competing
mode. The existing **Eat out / order** intent becomes the umbrella for *all*
non-cooking food decisions, with nearby discovery as a capability inside it:

```
Today
├── Cook
└── Eat out
      ├── Find food near me                      (nearby discovery)
      └── Help me choose what to order           (category guidance)
```

The exact wording can evolve. "Grab a snack" is also a non-cooking decision and
conceptually sits under Eat out; whether it stays its own entry is not worth
settling now. The third existing intent, "Plan ahead", is the future **Stock
up** domain: kept as-is and unbuilt (see "Terminology" for the label). Choosing
among the domains is itself a light decision, which is why Home leads with the
user's intent rather than a form, and users who normally eat out get useful
recommendations without being forced into Cook.

### Order Food — coaching philosophy

This mode is **harm reduction, not diet enforcement.** The job is to meet the
user where they are and improve the decision, not to replace their craving
with the theoretically healthiest option.

- If the user wants fried chicken, the recommendation is built around fried
  chicken — a reasonable portion, a lighter or vegetable side, fries as an
  option rather than a forbidden one, no drink added just because a combo
  includes it. Never "eat grilled chicken and vegetables instead."
- No moralizing language: no "good food" / "bad food," "clean" / "cheat,"
  "guilty," "you shouldn't eat this."
- No reflexive calorie restriction. Someone who says they're starving is not
  well served by a 300–400 kcal salad — that isn't a useful intervention.
- A recommendation may include **one** simple, realistic modification (sauce
  on the side, a lighter side instead of fries) — never a list of
  prohibitions, and never mandatory if the order is already reasonable.

### Order Food — what it is not

Out of scope for **this category-based mode** as built today: restaurant
discovery, restaurant APIs (DoorDash, Uber Eats, Google Maps), live menus or
prices, geolocation, and automatic ordering. The output is a category to
search for — "search DoorDash or Uber Eats for 'chicken shawarma plate'" —
never a specific restaurant or an order placed on the user's behalf. This is a
text decision aid built on the existing recommendation infrastructure, not a
new product surface.

Nearby restaurant and café discovery is a *separate, additional* capability
inside Eat out — see "Eat out — nearby" under Extended MVP. It does not change
what this mode is.

---

## Top-level product structure

The app is organized around five top-level areas (Saved was added
2026-09-30; the earlier five-screen structure is gone):

- **Home** — "What do you need right now?" Entry intents: **Cook**,
  **Eat out / order** (the umbrella for every non-cooking decision — see "Home
  structure" above), and **Plan ahead** (the future Stock up domain; unbuilt).
- **Plan** — **short-horizon flexible provisioning**, not meal planning: help
  the user prepare enough flexible food for the next few days so each actual
  meal can still be decided dynamically that day. Also where saved recipes
  live. It never means fixed meals laid out ahead. Extended MVP or later; not
  yet built. (Label under review — see "Terminology".)
- **Groceries** — one consolidated list — from a saved recipe's missing
  ingredients or a stock-up basket — distinguishing already-have /
  need-to-buy / optional. Extended MVP or later; not yet built.
- **Saved** — recipes and places the user explicitly saved to return to.
  **Saved is explicit interest**, durable and per user; it is *not* "Picked"
  (chosen for this meal), not "Ate / ordered" (confirmed behavior) and not
  "Loved" (strong preference, unbuilt), and it **does not yet change any
  recommendation ranking** — it may become a positive signal later, separately
  promoted. A saved recipe is kept exactly as generated and re-checked against
  the *current* Profile when shown (an allergy match is warned about, never
  hidden or silently rewritten). A saved place is keyed by its provider place
  id; a hard "not for me" removes it from Saved (soft downranking does not).
  It is a small return-to list, not a recipe library to manage: no folders,
  tags or search.
- **Me** — the persistent Food Profile, and eventually the rest of the
  long-term information described under Core-loop MVP and Extended MVP below
  (equipment, fridge size, foods at home).

This replaces an earlier five-screen structure (Today / Results / My Food /
Inbox / Profile). Saved recipes (the legacy "Recipe Inbox") and recent
meals/favorites are not removed from scope — they move conceptually under Plan
and Me/Groceries respectively,
still gated by the same Extended MVP promotion rule as before. See
`CLAUDE.md` → "The top-level information architecture" for the routing detail
and the full screen-by-screen table.

---

## Terminology and legacy labels

Documentation uses the **preferred** term. Some **legacy** labels survive
because they are hard-coded in the application; renaming code is separate work
and is not authorized by this document.

| preferred term (docs) | legacy / current label | status |
|---|---|---|
| **Food Decision** — the product; positioning is "context-aware food decision assistant" | **"Nutrition Coach"** — the app's display name in `layout.tsx` and `manifest.ts` | Temporary working name, **not** the positioning. The product is not a generic AI nutrition coach. Not renamed in code. |
| **Stock up** | **Plan / Plan ahead** — live bottom-nav tab, `/plan` route, Home intent | Docs prefer Stock up because the feature is flexible provisioning, not rigid meal planning. Live nav unchanged until a rename is promoted into `PLAN.md`. |
| **Estimated daily energy range** | **"Daily calorie target"** — Profile field label, `daily_calorie_target_kcal` | Use the preferred term unless referring explicitly to the existing legacy field. See "Nutrition target refinement." |
| **Recent meals** / **recent choices** | "Meal history" | Purpose is context and repetition awareness, not a food diary. |
| **Approximate recent-intake context** | "Remaining daily nutrition" | LATER only. Never "calories/macros remaining today." |
| **Meal context** — breakfast / lunch / dinner / snack, or the current eating situation | "Food occasion" | Avoid framing it as a fixed per-meal calorie allocation. |
| **Eat out** (umbrella) | "Order Food" / "I want to order food" — the built category mode | UI label stays; it is now one capability inside Eat out. |
| **Kitchen staples** (persistent condiments/seasonings) + **today's food** (entered fresh each time) | "Pantry" | "Pantry" is retired: it blurred persistent seasonings with perishable food and went stale. Do not reintroduce it, in code or docs, to mean stored food. See `CLAUDE.md` → "Kitchen staples vs. today's food." |
| **Interaction modes** (Cook / Eat out / Grab a snack) | "Decision modes", "action domains" (when used loosely) | Modes are how the user *enters* a decision; **action domains** (Cook / Eat out / Stock up) are the kinds of solution. Neither is a separate product. |
| **Saved recipes** now; a more neutral future term such as **saved ideas** if the feature broadens beyond recipes | **"Recipe Inbox"** | Legacy: "Inbox" was removed from nav; the `recipes` table keeps the name. Flagged, not renamed. |
| **Option images** if extended beyond Cook | **"Recipe visualization"** | Accurate today (Cook-only dish photos). If images are ever added to nearby places or store items, the word "recipe" no longer fits. Flagged, not renamed. |

---

## Product principles

**1. Optimize for execution, not theoretical nutrition.**
A nutritionally perfect meal the user will not cook is a bad recommendation.

**2. Reduce decisions.**
The product should reduce cognitive load, not create more forms, menus, or
choices. Concretely: **the user should make the minimum number of decisions
possible.** The product absorbs complexity and progressively reveals only
what is needed for the current task — one meaningful decision at a time,
not every control on one screen. "Question → answer → next question →
recommendation" is the target shape, not "large form → many dropdowns →
many controls → output." See `CLAUDE.md` → "Minimum decisions, progressive
disclosure" for the implementation-level rules this implies.

**3. Three options, not infinite discovery.**
This is a decision product, not a recipe discovery feed. The full rule is
"Exactly 3" below.

**4. Context matters.**
Recommendations should reflect today's available time, hunger, effort
willingness, craving, ingredients, and budget.

**5. Taste and culture matter.**
"Healthy" should not force users into unfamiliar Western health-food patterns.
Cuisine and taste preferences should meaningfully affect recommendations.

**6. Learn from behavior — carefully.**
What users actually eat and repeatedly avoid matters more than stated *soft*
preferences alone. But behavior only ever adjusts soft ranking: hard
constraints are never overridden by inference, one choice does not establish a
permanent preference, and not selecting an option does not mean disliking it.
See `PERSONALIZATION.md`.

**7. Low friction first.**
Prefer chips, buttons, defaults, and one-tap interactions. Avoid making the
user write long prompts.

**8. The more you use it, the less you should have to explain yourself.**
The product should ask for less input over time, not more. Memory is used to
pre-fill, never to silently assume: a remembered answer is shown and editable in
one tap (`PERSONALIZATION.md`), and it never makes the *next* question a longer
one. The goal is to **minimize time spent deciding what to eat**, not to
maximize time in the app — see "Success measures."

**9. Stored context must change a recommendation.**
Persistent information — allergies, foods avoided, equipment, nutrition goals,
budget, saved places — must eventually affect ranking or filtering. A Profile
field that no recommendation reads is a form to fill, not personalization, and
it costs the user effort for nothing. Before adding a field, name the behavior
it changes; if a stored field stops changing anything, wire it in or remove it.
(A field kept deliberately as context only must say so — e.g. optional health
conditions, which only *suggest* a nutrition priority.) `PERSONALIZATION.md`
lists what each field changes today.

### Decision priority order

When a recommendation has to trade things off, it optimizes roughly in this
order — earlier items win over later ones:

```
1. likelihood the user will actually eat it
2. context and craving
3. feasibility (time, equipment, ingredients, budget)
4. health goal
5. nutrition / protein
```

Hard constraints sit outside this ordering: they override every item on it.
Nutrition and protein are deliberately last — a nutritionally excellent meal
the user won't eat is a bad recommendation (principle 1) — but they are a
real, soft input, not an afterthought. **This is the canonical statement**;
other documents refer to it rather than restating it, so that new features
(personalization, location, grocery) inherit one order.

### Hard constraints vs. soft preferences

Two tiers, never conflated. **This is the canonical definition.**

**Hard constraints** — must be respected by **every** recommendation mode
(Cook, every form of Eat out, Stock up); never overridden by behavioral
inference; never relaxed to reach three options (see "Exactly 3"):

- *Safety and dietary:* food allergies; dietary restrictions (for example
  vegetarian, vegan, halal, kosher, gluten-free by need); other safety-related
  food exclusions.
- *Feasibility limits:* unavailable equipment, maximum cooking time, the
  budget ceiling, and available ingredients ("Kitchen staples vs. today's
  food" in `CLAUDE.md`).

**Soft preferences** — affect ranking, are never safety constraints: disliked
foods, preferred cuisines, preferred ingredients, taste leanings, routine
defaults.

Rules that follow:

- **Disliked foods are not allergies or restrictions.** A dislike is a very
  strong ranking penalty, not an absolute exclusion. Anyone who must never be
  served something — for safety, health, or religious reasons — records it as
  a hard constraint, not as a dislike.
- **No safety claims.** The product cannot verify allergen content of a recipe,
  a restaurant, or an item, and never calls an option "safe" or
  "allergen-free." Respecting a constraint means never *knowingly*
  recommending something that violates it.
- **Status (2026-09-30):** the Profile now has a dedicated **Allergies** list,
  separate from *disliked foods*, and allergies are a hard constraint in every
  recommendation mode; dislikes are soft in every mode. **Dietary restrictions**
  (vegetarian, vegan, halal, kosher, …) still have no Profile field, and the
  allergy rule is enforced in the prompt and, since 2026-10-05, by a literal
  allergen-name check in code on every mode's cards (no aliases, so it catches a
  slip and never proves a dish safe).
  How hard constraints interact with learning is in `PERSONALIZATION.md`.

### Exactly 3 — decisions, not execution artifacts

**Canonical rule: exactly 3 applies to decision recommendations, not
execution artifacts — and truth beats the three-item rule when fewer than 3
valid, real options exist.**

The principle exists to stop decision fatigue at the moment the user is
*choosing*. It does not mean every output comes in threes.

**A decision recommendation → exactly 3 choices**, whenever the user is still
deciding what kind of thing to do: "What should I eat?" → 3 choices; "Where
should I eat nearby?" → 3 nearby places; choosing among food actions (cook /
eat out / stock up), where the product offers that choice → 3 choices where
appropriate.

**An execution artifact → one, optimized**, once the user has selected an
action and needs the thing itself: "Stock me for 4 days" → one grocery basket;
"What ingredients am I missing?" → one missing-ingredient list; a selected
recipe → one set of instructions.

**Do not create three artificial alternatives when the user is no longer
making that type of decision.** Three baskets, three versions of one shopping
list, or three variants of a recipe already picked add exactly the cognitive
load the product exists to remove. The user can still ask for a different one
(regenerate, adjust); the product just doesn't front-load variants nobody
requested.

**Test:** is the user choosing *what to do*, or have they chosen and now need
*the thing*? Choosing → three. Chosen → one.

**Truth beats three.** Three is the target, not a quota. When fewer than three
valid, real options exist, return fewer — down to zero — and say so honestly,
rather than padding with something invented: a missing ingredient (cook "Use
what I have" may return 0–3; zero routes to "Show me what to buy"), a
nonexistent or closed place, or an item that violates a hard constraint. Fewer
honest options beat three dishonest ones. This never licenses returning fewer
merely because ranking was hard.

### External integrations

**Avoid external integrations before they are necessary to test a core product
hypothesis. Introduce them only when the user value cannot be meaningfully
validated without them, and keep them narrow, replaceable, and
cost-controlled.**

This replaces the older, absolute "no external APIs before validation."
Applied:

- **Nearby Eat out qualifies.** Whether nearby-place discovery helps people
  decide cannot be validated with generated, fake businesses — real places are
  the point. Its integration requirements are in "Eat out — nearby."
- **Menu ingestion, delivery-marketplace, ordering, and grocery-inventory
  integrations do not qualify yet.** The core decision — where or what — can
  be tested without them.
- **"Necessary" is judged against the hypothesis, not against how impressive
  the integration is.**

---

## MVP — two layers

The MVP has two layers, and the distinction matters more than any individual
feature. **Core-loop MVP** is what we need before the product hypothesis can be
tested at all. **Extended MVP** makes the product more useful once the loop
already works. Building extended items first would mean polishing a loop we
have not yet proven anyone completes.

`PLAN.md` is the authority on which layer is currently being built.

### Core-loop MVP

Required before we can test the fundamental hypothesis:

```
Context → Recommendation → Selection → Actual eating → Feedback
```

**1. Food Profile** — the persistent half of the context:

- primary health goal
- protein target
- optional, manually entered estimated daily energy guidance (legacy UI label:
  "daily calorie target" — see "Terminology")
- normal food budget
- **hard constraints** — allergies, dietary restrictions, other safety-related
  exclusions. *Not yet in the Profile; a NOW foundation item in `PLAN.md`.* See
  "Hard constraints vs. soft preferences."
- **soft preferences** — cuisine preferences, disliked foods (a very strong
  ranking penalty, not a safety constraint)
- kitchen equipment
- fridge / storage constraints
- **Kitchen staples** — persistent condiments and seasonings only (salt, oil,
  soy sauce, spices), never actual food. See "Kitchen staples vs. today's
  food" in `CLAUDE.md` for the full rule and why it's kept separate from
  "ingredients available right now" below.

**2. Today context** — the dynamic half, re-entered each time. The user first
picks a decision mode, then answers only what that mode needs:

- **I can cook**: available cooking time, hunger level, desired effort,
  craving, optional budget override, ingredients available right now. This
  is entered fresh each time and never persisted — see "Kitchen staples vs.
  today's food" in `CLAUDE.md`.
- **I want to order food**: hunger level, a craving category (meaty / warm &
  comforting / fresh & light / something sweet / no strong preference, plus
  optional free text), and how they're getting the food (delivery / pickup /
  eat nearby). Reuses the same profile fields as cooking — goal, protein
  target, dislikes — rather than asking again.
- **Grab a snack**: hunger level and a one-tap craving type (sweet / salty /
  crunchy / creamy / anything). The lightest of the three — no free text, no
  store or method question, since there's no store data behind this mode to
  ask about. Reuses goal, protein target, and dislikes from the profile.

**3. Exactly 3 recommendations** — the canonical rule is "Exactly 3" under
Product principles: three for every *decision*, one for an execution artifact,
and truth beats three when fewer valid real options exist. Within a decision,
the three have distinct purposes:

1. best overall match
2. lowest-effort option — for ordering, the simplest thing to find and order
   right now
3. a meaningfully different option in cuisine, style, or protein source — it
   may be somewhat higher in protein when useful, but does not optimize for the
   maximum protein possible

For "I want to order food," a recommendation is a **meal category**, not a
recipe: what to search for in a delivery app, a suggested order
configuration, and why it fits right now — no steps, no ingredient list, no
cooking equipment. See "Order Food" above for the coaching philosophy and the
explicit non-goals of *this category mode* (no restaurant APIs, no restaurant
discovery, no ordering). Nearby-place discovery is a separate capability inside
Eat out.

For "Grab a snack," a recommendation is a **ready-to-buy item**: what to look
for while walking around the store (a category and a rough, useful spec —
"single-serve Greek yogurt with 12–20g protein" — never an exact SKU or a
claim about live inventory), why it fits the craving, and an optional backup
if the first isn't found.

Regenerating ("Show me 3 more") must produce genuinely different options, not
cosmetic renamings of the same meal, category, or item — the same rule every
mode follows.

Each recommendation carries approximate time, calories, protein, and two
costs: what the meal is worth (`~$9 meal`) and what the user would spend
tonight on missing ingredients (`~$2 more to buy`). The budget limit applies to
the second — food already owned never makes a meal fail the budget.

**Budget means two different things.** Cook budget caps *additional* spend on
missing ingredients (a hard constraint, above). Eat out has its own
`meal_budget`: the approximate amount the user wants to spend on the current
meal, chosen as a coarse band (or "No strong preference", also the meaning of a
missing value). It is a feasibility and ranking signal, never a guaranteed
price ceiling, and the two are never merged into one field. In Nearby, Google
Places `priceLevel` is coarse provider metadata, not menu-item pricing, so it
may support cautious tendency wording ("more likely to fit your budget") but
never an exact price, a dish price, or a delivery total. An unknown price level
stays unknown: it is neither a reason to pick a place nor to avoid it, and it
supports no price-fit claim.

**Cost estimates are low confidence.** They come from the model alone, with no
grocery-price data, store, or region behind them. They are useful for "cheap
versus expensive", not for real budgeting, and should eventually be replaced
or supplemented by real price data (see Grocery intelligence).

**Protein is a target range, not something to maximize.** A daily target
covers the whole day and the app does not know what else the user ate, so each
meal aims for roughly a third of the daily target — somewhat more when very
hungry or asking for high protein, somewhat less for a light meal. Protein is
last in the decision priority order (see Product principles); hard constraints
override it.

**Calories are a soft energy envelope, not "lower is always better."** A meal
too small to satisfy is a bad recommendation too. When the user has entered
daily energy guidance, it sets an approximate range for this meal, scaled by
hunger and meal size. Without one, the goal gives direction only — moderate,
filling portions for fat loss, ordinary portions to maintain, substantial meals
welcome for muscle gain — and no calorie number is assumed. The app never
pretends to know how many calories the user has left today.

**Recipes shouldn't need a kitchen scale.** Quantities lead with everyday
measures ("1 medium salmon fillet, about palm-sized") and add an approximate
weight only where it helps the nutrition estimate ("~6 oz / 170 g").

**4. Select a recommendation** — the user picks one of the three.

**5. Record whether it was actually eaten** — the success event the entire
product is measured by. Everything upstream exists to make this happen.

**6. Basic rejection / feedback reason** — if they did not eat it, why not.
Liked / disliked, and the reason for rejection.

### Extended MVP

Useful early extensions. **Build only after the core loop works end to end:**

- Saved recipes (legacy label: "Recipe Inbox" / recipe memory) — save recipes
  to try; surface them when the current context makes them appropriate. May
  accept pasted text or URLs.
- Recent meals — recent choices, for repetition awareness and context. Not a
  food diary.
- Favorites
- Basic preference learning — rules-based, soft ranking only; see
  `PERSONALIZATION.md`
- Routine defaults — user-set default contexts for weekday lunch, weekday
  dinner, and weekend, used as pre-selected defaults on Home; see
  `PERSONALIZATION.md`. A hypothesis that these contexts differ enough to
  matter, not a finding.
- **Eat out — nearby** — nearby restaurant and café discovery plus contextual
  ranking. See below.
- Nutrition baseline — estimated daily energy range and protein target/range,
  *when the required Profile inputs exist*; see "Nutrition target refinement."
- Meal context — see below
- Measurement-style preference — see below

"Approximate recent-intake context" (formerly "remaining daily nutrition")
is a future direction, not Extended MVP.

Having a screen shell for one of these does not make it core. `Plan` and
`Groceries` exist in the navigation today as empty containers (see
`CLAUDE.md` → "The top-level information architecture"); the functionality
inside them is Extended MVP or later.

#### Eat out — nearby

**Promoted to Extended MVP (NEXT) 2026-09-29.** A core extension of the
product's primary job: users who normally eat out should get useful
recommendations without being forced into Cook. Like everything in Extended
MVP, it starts only after the Core-loop MVP works end to end, and it depends on
hard-constraint support (NOW) so nearby recommendations respect allergies and
dietary restrictions.

**Where it lives.** Inside the Eat out umbrella, as "Find food near me" beside
the category guidance — not a new Home intent and not a competing mode (see
"Home structure").

**What it is:** nearby place discovery + contextual ranking. The user taps to
find somewhere to eat; the browser requests location **only at that moment**;
the app retrieves nearby restaurants and cafés from a places provider, ranks
them against context (craving, hunger, time, budget feel, distance, open now,
goal and cuisine fit, past acceptance where it exists), and returns **three
nearby places** with a short reason each — a decision recommendation, so
"Exactly 3" applies, including truth beating three: if only two valid open
places exist, return two. The model *interprets, ranks, and explains*
retrieved places; it never invents one. Hard constraints apply at the level the
product can know (for example, not steering a vegetarian toward a steakhouse);
it never asserts that a venue or item is safe.

**What it can say about a place:** name, category, distance, open/closed, price
level, a link to the place's own website where available, and a provider
rating as one light ranking input — plus a *suggestion* of what kind of thing
to look for on their menu ("look for a grilled chicken rice bowl, sauce on the
side" — a generic dish plus one simple tweak, shaped by craving, hunger, budget,
and nutrition priorities). That suggestion is guidance, never a claim that a
particular item exists, and the card labels it as such. Review content and
review features are out of scope. The product answers "where" first; "what to
order there" stays restaurant-level guidance until a real menu source exists —
Google Places has no menu, menu-URL, or ordering data, so naming real items
(curated chain menus, PLAN.md → V2) is not built.

**Not part of this slice** (canonical list; other documents refer here):

- full restaurant marketplace behavior
- full menu ingestion or menu search
- guaranteed item-level menu availability
- item-level nutrition, unless a reliable source exists for that item
- restaurant ordering, or replacing DoorDash / Uber Eats
- reservations
- restaurant reviews
- grocery-store discovery and the recipe → nearby-grocery handoff (future;
  same place layer, separate promotion)

The near-term goal is **not** building a restaurant marketplace.

**Provider and integration requirements.** This is the first external
integration, so it sets the pattern (see "External integrations" under Product
principles). It qualifies because real nearby places cannot be validated with
generated fake businesses. It must be:

- **Isolated behind a small provider boundary** — the recommendation system
  works with the product's own minimal place shape, not one vendor's
  response, so the provider can be replaced.
- **Narrow** — request only the fields the decision needs; none "just in
  case."
- **Not dependent on expensive metadata** the core decision doesn't need. If a
  costly field is merely nice to have, leave it out; the feature must still
  work without it.
- **Cost-controlled and observable** — provider usage and cost are measurable
  per feature, and requests are bounded (one explicit tap, a limited result
  set).
- **Provider for v1: Google Places API (New)** — implemented 2026-09-29 behind
  a provider interface (`src/lib/places/`), so it remains replaceable. Requests
  use an explicit field mask; requesting open-now and price level puts each
  search at Google's higher (Enterprise) billing tier — see the comment on
  `PLACES_FIELD_MASK` in `src/lib/places/config.ts`. The feature does not
  depend on either field.

**Privacy.** Request location only on an explicit tap; prefer temporary,
session-scoped location; do not store precise location by default.

#### Nutrition target refinement

Near-term Profile nutrition guidance is deliberately limited to two things:

- **an estimated daily energy range**
- **a protein target/range** — stays the prominent target

Nothing else. They primarily support **recommendation quality**. They are
*not* a precise calorie prescription, *not* a calorie budget, and *not*
carbohydrate/fat tracking — see "Product identity and guardrails" (the
product is not a macro tracker). Every number is an estimate, shown as one, that
the user can accept or edit.

**Carbohydrate and fat targets are not a current product priority and are
not part of Extended MVP.** They may remain a possible later, advanced detail
if real users ask for them; nothing is promised, and adding them would need
explicit promotion into `PLAN.md` plus a check against the macro-tracker
guardrail.

**Required inputs — a dependency, not a detail.** A valid energy estimate
cannot be produced from the existing Profile alone: today it holds a goal, a
protein target, a manually entered number, and no body or activity data. A
"Suggest for me" estimate needs an appropriate set of inputs, such as:

- age
- height
- weight
- the biological/physiological input required by the selected validated
  equation, if applicable
- activity level
- goal

These are optional, entered by the user, and never inferred from behavior
(`PERSONALIZATION.md`, principle 9). **The calculation method is chosen and
documented when the feature is implemented — it is deliberately not
prescribed here.**

**No fabricated estimates.** If a required input is missing, the product does
not produce an energy estimate — no guess from averages, defaults, or the goal
alone. It falls back to what it does today: qualitative goal guidance, or the
user's own manually entered value. Users who already know their number can
always enter it. The existing legacy field stores a single number; how a range
and manual entry coexist is an implementation decision. A protein target
suggested (rather than typed) needs the same honesty about inputs.

**Usual eating pattern** — 2 meals, 3 meals, or 3 meals plus snacks — may also
belong in the profile. The same daily guidance implies very different meal
sizes depending on how many times someone eats, and today's guidance assumes
roughly three meals for both protein and calories.

#### Meal context

Whether this is breakfast, lunch, dinner, a snack, or dessert — or, more
broadly, the current eating situation — will eventually shape a recommendation:
its size, effort, and type. For now the Core-loop MVP is about meals only and
the Today flow does not change. Meal context informs recommendations
*qualitatively*; it is not a scheme of fixed per-meal calorie allocations. It
connects to routine defaults (weekday lunch / weekday dinner / weekend) in
`PERSONALIZATION.md`.

#### Measurement style

A possible profile preference: **Everyday measures**, **Precise weights**, or
**Both**. Until it exists, every recipe uses *Both*, with the everyday measure
first and an approximate weight only where it materially helps the nutrition
estimate.

---

## Current hypothesis

This is a **hypothesis, not a finding.** Nothing below has been validated with
users yet.

> If we reduce food decision-making to a very low-friction interaction, and
> recommendations fit the user's real context, users will make healthier food
> decisions more often and rely less on expensive convenience food.

## What we need to prove, in order

These are **proof steps** (called "Stages" in earlier versions; renamed
2026-10-05 so they are not confused with the four strategic stages in
`PLAN.md`).

| Proof step | Question |
|---|---|
| 1 | Will the founder personally use this repeatedly instead of deciding meals manually? |
| 2 | Will 5–15 target users use it? |
| 3 | Will any of them return without being reminded? |
| 4 | Does recommendation → actual eating happen repeatedly? |
| 5 | *(Strategic hypothesis, added 2026-10-05.)* Does the product need **less input** from a returning user over time, with picks staying accepted — i.e. is the compounding loop real? |
| 6 | *(Strategic hypothesis, added 2026-10-05.)* For the same stated context, does a user **with history** get a different and better-accepted set than a brand-new user? |

Steps 5 and 6 are what separate the long-term product from the wedge. They
cannot be answered until steps 1–4 produce repeat usage and recorded
feedback, and nothing has been observed for either yet.

**Strong signal:** a user feels meaningfully worse going back to deciding
meals without the product.

## North-star behavior

```
User has a food decision → opens the product
                         → accepts a recommendation
                         → actually eats it
```

Every major feature should improve some part of this loop. A feature that does
not is, at best, a distraction.

## Success measures

The goal is **not** to maximize time spent in the app; it is to **minimize time
spent deciding what to eat.** Session duration, screens viewed, and
"engagement" are not success measures here — a faster decision is a better one.

The outcome is the north-star behavior above (the recommendation is actually
eaten). These are the leading indicators around it:

| measure | what it tells us |
|---|---|
| **Decision completed** | The user reached a pick instead of abandoning or deciding elsewhere. |
| **Recommendation accepted** | They chose one of the options. A high "none of these — show me 3 more" rate is a quality signal about the *set*, never a verdict on any individual food. |
| **Time to decision** | Open → pick. Should shrink as memory builds. |
| **Input per decision** | Answers and taps needed per decision, per returning user. Should fall over time while acceptance holds (proof step 5). |
| **Repeat usage at meal-decision moments** | The user comes back around the times they actually decide what to eat, unprompted (proof step 3). |

**Status:** none of these is instrumented as a metric today. The loop's
records (a chosen pick, "did you eat it?") exist; "Basic product analytics" is a
NEXT item in `PLAN.md`. Do not report any of them as measured until it is.

---

## Two kinds of "not now"

These are different things and should not be confused:

| | means |
|---|---|
| **Current non-goal** | Do not build during the current MVP phase unless it is explicitly promoted into `PLAN.md`. |
| **Future direction** | A hypothesis or possible expansion worth remembering, with **no commitment to build it**. |

An item can be both: excluded from this phase, and still interesting later.
Neither status is permission to build. Promotion into `PLAN.md` NOW or NEXT is
the only thing that authorizes work.

## Current non-goals

Do not build during the current MVP phase:

native iOS app · native Android app · live grocery pricing · Instacart
integration · grocery delivery · grocery checkout and inventory integrations ·
everything listed under "Not part of this slice" in "Eat out — nearby" ·
receipt scanning · barcode scanning · exact ingredient quantities ·
expiration-date tracking · Apple Health integration · wearable integration ·
automatic calorie logging · manual calorie or macro logging · carbohydrate/fat
targets · social or community features and feeds · family accounts · fixed
weekly meal planning · recommendation ML models · vector databases · complex
agent architecture · subscriptions or payments · admin dashboards

Nearby restaurant/café **discovery** and its one-tap geolocation are *not*
non-goals (promoted 2026-09-29; see "Eat out — nearby"). Identity-level
exclusions — calorie/macro diary, rigid meal planner, recipe database, generic
AI nutrition coach — are defined once under "Product identity and guardrails"
and are not repeated here.

---

## Possible future directions

**These are possibilities, not commitments.** None is scheduled. Nothing here
may be built until it has been explicitly promoted into `PLAN.md` NOW or NEXT.

Ordinary Recipe Inbox does **not** appear here — it is an intended early
capability and lives in the Extended MVP above.

- **Location-aware recommendations — beyond the NEXT slice.** Restaurant/café
  discovery is now Extended MVP ("Eat out — nearby"). Still future: nearby
  grocery-store discovery, restaurant-specific menu recommendations, and
  eventually store-specific grocery products — moving further from "the model
  invents three foods" toward "retrieve real nearby options, rank them, explain
  the top 3"; see below.
- **Recipe → missing ingredients → nearby grocery store** — when a cook
  recommendation needs a few things the user doesn't have, produce **one**
  missing-ingredient list and hand it off to nearby grocery stores.
  Store-agnostic: it names *where* to go, not what is in stock or its price.
  Depends on grocery-store discovery from the location layer below, which is
  not part of the NEXT slice; not buildable before it.
- **Stock up — "Stock me for N days"** — flexible provisioning; see below.
- **Approximate recent-intake context** — optional and approximate; see below.
- **Grocery intelligence** — store-specific products, live prices, and
  inventory-aware grocery recommendations. Covered as grocery Level B under
  "Location-aware recommendations" below; would replace or supplement
  today's model-only cost estimates.
- **Advanced recipe importing** — Instagram / TikTok / social recipe
  ingestion, automatic video recipe extraction, browser and share extensions,
  and automatic adaptation of imported recipes to the user's equipment, time,
  goal, and ingredients. Not part of the current MVP.
- **Personal recipe capture** — an important future personalization
  capability; see below.
- **Weekly meal planning — fixed schedules are excluded** (see guardrails).
  The legitimate need underneath it — being prepared for the next few days —
  is served by **Stock up** below. Kept only as a pointer so the distinction is
  not lost.
- **Cook / assemble / buy** — compare three kinds of food decision: cook it,
  assemble it with minimal preparation, or buy something nearby. *A compact slice
  of this was promoted by the founder on 2026-11-08 and built — see "Cross-way
  ('open') decisions"; a side-by-side comparison UI, and choosing the way from
  evidence about the person, are still only this idea.*
- **Adaptive preference learning** — learn cuisine preference, effort
  tolerance, ingredient preferences, meal patterns, and routine contexts
  (weekday lunch / weekday dinner / weekend) from actual behavior. The
  rules — including that one choice never sets a permanent preference and
  non-selection never means dislike — are in `PERSONALIZATION.md`. Related to
  the future ranking engine's `historical_acceptance` signal; see
  "Location-aware recommendations" below. Basic, rules-based versions of this
  are Extended MVP; the adaptive form is future.
- **Household mode** — potentially support couples or families.

### Personal recipe capture

**Future direction. Not part of the core loop, not scheduled.**

The idea: **the app should remember how the user actually likes to eat, not
just import recipes created by other people.**

A user makes a meal, likes it, and wants the app to remember it — without
filling out a recipe form. They tap something like **"I made something I
liked"** and describe it naturally, by text or voice:

> I made chicken thighs in the air fryer with soy sauce, black pepper and a
> little honey. I ate it with rice and cucumber. It was easy and I loved it.
> Next time I'd use less honey.

The AI converts that into the app's structured recipe format, extracting or
estimating:

- recipe title
- ingredients, with approximate quantities when available
- cooking steps
- equipment
- estimated time
- cuisine / tags
- estimated nutrition
- personal notes ("less honey next time")
- rating / preference

**The user reviews the structured version before it is saved.** The model
drafts; the user confirms. It is a single description in and a reviewable
draft out — not a chat.

Eventually the Recipe Inbox could hold three sources:

| source | what it is | status |
|---|---|---|
| **I found this** | Pasted or imported external recipes | Ordinary form is Extended MVP |
| **I made this** | Text or voice, converted into a structured personal recipe | Future direction |
| **I ate this and liked it** | A recommendation saved as a reusable personal recipe | Future direction, close to Favorites |

Personal recipes feed back into recommendations when the context fits. For
example, the user previously made and loved a chicken rice meal; today they
have chicken, want something warm, and have 20 minutes — so the recommender can
surface that recipe again instead of inventing a new one.

### Approximate recent-intake context

*Formerly "remaining daily nutrition context."* **Future direction (LATER).**
Not part of the core loop, not scheduled. It needs reliable intake/feedback
data the product does not yet have, and it risks pushing the product toward
calorie tracking — the thing it must not become.

Today each meal aims for a share of the daily guidance because the app has no
idea what else the user ate. If the core loop eventually records enough
actually-eaten meals, the app *could* form a rough sense of recent intake —
that today has already been large, or light, or low in protein — and use it to
nudge later meals **without the user logging anything**.

It is **approximate recent-intake context for recommendation quality**, not
"calories or macros remaining today": never a balance the user sees or must
manage, and never a required logging system. Caveats that are part of the
idea, not footnotes:

- **It depends on the core feedback loop** being complete and reliable enough
  that "confirmed eaten" means something.
- **It undercounts.** Food eaten outside the app — a snack, a coffee, a meal
  out — is invisible, so any figure errs low on intake, never ground truth.
- **Promotion needs evidence** (record it in `LEARNINGS.md`) that it improves
  recommendations without making users feel tracked.

### Stock up — "Stock me for N days"

**Future direction. Not part of the core loop, not scheduled.** Not buildable
until promoted into `PLAN.md`, and not before the Groceries container has real
contents. This is the **Stock up** action domain.

**What "Plan ahead" (the legacy label) means here:** **short-horizon
flexible provisioning** — *not* meal planning. Help the user prepare enough
flexible food for the next few days, so each actual meal can still be decided
dynamically from that day's context.

The idea: a user about to go shopping asks, in effect, **"what should I buy so
I can eat decently for the next few days?"** — and gets **one** flexible,
optimized grocery basket — an execution artifact, so one, not three (see
"Exactly 3"). "Stock me for 4 days" may produce that basket; it must not lock
the user into a Monday/Tuesday/etc. meal schedule.

- **Flexible, not scheduled.** Versatile ingredients and easy backups — a
  couple of protein anchors, produce, a carb base, a ready-to-eat fallback —
  each usable in several meals, optionally with a few example meals it enables.
  No "Monday: X, Tuesday: Y." Which meal happens when is still decided in the
  moment through the normal core loop.
- **Shaped by the same context:** goal, protein target, budget, fridge/storage
  limits, equipment, and — once it exists — the user's routine (how many
  meals at home versus out).
- **It does not create a pantry.** What the user buys does not become a
  persisted inventory. When they later cook, "What do you have right now?" is
  still entered fresh, per "Kitchen staples vs. today's food" in `CLAUDE.md`.
- **Why it isn't a meal planner:** the output is a shopping decision, not a
  commitment to a schedule. If a version of it starts to feel like a plan the
  user can fall behind on, it has crossed the guardrail.

### Location-aware recommendations

**Mostly future direction; one slice promoted.** Restaurant and café
discovery with contextual ranking (Phase 1.5) is Extended MVP — its scope,
exclusions, provider and privacy rules are defined once, in "Eat out — nearby,"
and that definition wins where this section is broader. **Everything else
here** — grocery-store discovery, restaurant-specific menus (Phase 2), grocery
Level B, marketplace integration, the ranking engine — is future direction:
not scheduled, and not authorized to build until explicitly promoted into
`PLAN.md` NOW or NEXT. The section exists so the long-term shape of the system
is written down.

#### The shift this represents

The current MVP asks the model to invent three plausible options from context
alone:

```
User context → LLM invents 3 foods → explain
```

The long-term direction retrieves real candidates from the real world first,
then ranks and explains them:

```
User context + real-world nearby food supply
  → retrieve realistic candidate options
  → rank them
  → recommend 3 actionable choices
```

The LLM's job shifts from *inventing* candidates to *interpreting context,
ranking, and explaining* real ones. This is a real architecture change, not a
copy change, and it should happen in stages, each justified by evidence that
the previous stage is working — see "Two kinds of 'not now'" above.

#### Phase 1 — current MVP (for contrast)

Cook / Order / Grab a snack, as they exist today. Recommendations come from
user context alone: no nearby-place retrieval, no live menu or inventory
lookup, generic but actionable search/category guidance. This should stay
fast and low-friction, and should not be delayed for any external
integration below.

Primary MVP validation question:

> When I am hungry, tired, craving something, or about to make an impulsive
> food decision, do I open Food Decision and does it change what I choose?

This is the "Current hypothesis" in its sharpest form; nothing below
substitutes for answering it first.

#### Phase 1.5 — location-aware "Near me"

The restaurant/café part of this phase is promoted; its full definition is
"Eat out — nearby" under Extended MVP and is not repeated here. What remains
future is using the **same place layer** for grocery and convenience stores —
the basis of **recipe → missing ingredients → nearby grocery store**
(store-agnostic; Level A below). This phase does **not** depend on
DoorDash/Uber Eats access.

#### Phase 2 — restaurant-specific recommendations

Once a user selects a real nearby restaurant (for example "Sweetgreen – 0.4
mi"), the product can recommend what to order there, one useful modification,
an approximate calorie/protein range, and why it fits — the same coaching
philosophy as today's Order Food mode, applied to a real menu instead of a
category:

```
restaurant/location data → menu data → candidate menu items
  → nutrition/personal-preference ranking → top 3 → LLM explanation
```

**The hard part is not generating nutritional advice once menu items are
known — it's reliably obtaining current, structured restaurant menu data.**
Likely acquisition strategies, in increasing complexity:

- **A. MVP shortcut** — restaurant website/menu URLs, publicly available
  structured menu data, manually curated menu data for common chains.
- **B. Chain-specific support** — maintain menu data for common,
  high-frequency chains (Chipotle, Sweetgreen, CAVA, Panda Express, Subway,
  Shake Shack, Starbucks, etc.). More realistic to sustain early than
  depending immediately on a marketplace API.
- **C. Later** — official restaurant delivery/marketplace integrations, if
  and when approved and commercially appropriate.

#### Marketplace / delivery platform integration

DoorDash, Uber Eats, and similar platforms. Do **not** treat their menu APIs
as guaranteed infrastructure — access typically requires partnership,
approval, a commercial agreement, or integration-partner status, none of
which is assumed here. The architecture must not depend on full DoorDash/Uber
Eats menu access during early product stages; these integrations belong
after product validation and meaningful usage, not before.

Potential future capabilities, roughly in order of how little they depend on
formal access: opening a recommended restaurant in the delivery app,
deep-linking to a search/results page with a restaurant name or search query,
and — only if formal access exists — structured menu access and an eventual
ordering handoff. Do not claim direct ordering integration will definitely be
available.

#### Grocery recommendations — two levels

**Level A: store-agnostic grocery list.** Lower difficulty, useful earlier.
Given "sweet snacks for tonight + easy breakfast tomorrow," the app suggests
a plain list — Greek yogurt, berries, mini ice cream bars, rotisserie
chicken, tortillas, bagged salad — optionally alongside nearby grocery stores
surfaced by the Phase 1.5 location layer. Requires no exact product
inventory, no SKU-level search, no live prices. This can be implemented
relatively early.

**Level B: store-specific products.** Later, and significantly harder — "At
this exact Whole Foods location: Product X, $X.XX, currently available."
Requires external retailer/catalog/inventory data: grocery retailer APIs,
Instacart-like integrations, product catalog APIs, store-level inventory
systems. Challenges: rapidly changing inventory, store-specific availability,
pricing differences, catalog inconsistencies, and API access restrictions.
Do not put this in the MVP.

#### Future system architecture (conceptual)

```
User context
    |
    v
Decision Engine
  /     |      \
Cook   Order   Grab
         |       |
         v       v
   Location Service
         |
         v
 Nearby place retrieval
   /             \
Restaurants     Grocery
   |               |
   v               v
Menu data      Product/catalog data
   \               /
    \             /
      Candidate options
            |
            v
      Ranking engine
            |
            v
       Top 3 options
            |
            v
      LLM explanation
```

The evolution in one line: the current MVP has the **LLM generate candidate
foods**; the future system has **retrieval generate realistic candidates**,
**ranking select the best of them**, and the **LLM explain** the result.

#### Future ranking engine

Recommendation quality should eventually move beyond a pure prompt-based
system. Potential ranking features: `craving_match`, `hunger_fit`,
`calorie_fit`, `protein_fit`, `user_preference`, `historical_acceptance`
(the signal Adaptive preference learning above would feed), `distance`,
`price_fit`, `effort`, store/restaurant availability, time of day, and prior
feedback.

A conceptual scoring shape only — **not an equation to implement now**:

```
score = craving_match + protein_fit + calorie_fit + distance_fit
      + price_fit + user_preference + historical_acceptance
```

As retrieval and ranking take on more of "which options exist and which are
best," the LLM's job should shift further toward interpretation, contextual
reasoning, explanation, and natural-language presentation — not inventing
every candidate from scratch.

#### Key technical challenges

1. **Location permission** — browser geolocation, user consent, temporary vs.
   persistent location, mobile UX.
2. **Nearby place search** — API cost, request limits, filtering relevant
   place types, open-now status, distance/radius.
3. **Restaurant menu acquisition** — likely the single biggest challenge:
   inconsistent menu formats, frequently changing menus, no universal menu
   API, restaurant websites that don't expose structured data, and delivery
   marketplace API restrictions.
4. **Nutrition estimation** — menu items may not list calories, macros, or
   portion sizes; the product may need official nutrition data where
   available, estimation elsewhere, and uncertainty ranges throughout.
5. **Grocery inventory** — much harder than locating grocery stores:
   store-specific catalogs, live inventory, prices, SKU matching, changing
   stock.
6. **API/platform dependence** — avoid building the product around an
   external platform that can restrict access, change API terms, become
   expensive, or require commercial approval it hasn't earned. The
   provider-boundary and cost rules are in "Eat out — nearby."
7. **Recommendation reliability** — avoid hallucinating restaurants, menu
   items, product availability, or prices. Once real-world retrieval exists,
   recommendations must be grounded in retrieved candidates, never invented.

#### Prioritization principle

Integrations follow "External integrations" under Product principles: only
when the value cannot be validated without them, and narrow, replaceable, and
cost-controlled. The core question is still the one in "Current hypothesis" —
**does Food Decision meaningfully improve real food decisions?**

Location-awareness was the first integration to qualify: it moves
recommendations from "what could you eat" to "what can you realistically eat
or buy around you right now" — without requiring full delivery-marketplace
integration.

