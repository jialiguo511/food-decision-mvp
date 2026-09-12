# PRODUCT.md — Food Decision

The canonical product document for this repository. It describes the problem
and the strategy, not the implementation. For how to build, see `CLAUDE.md`.
For what to build next, see `PLAN.md`.

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

## Initial user (the wedge)

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

## Core product loop

```
Context → 3 meal options → choose → actually eat → feedback
        → better future recommendations
```

The real success event is **recommendation → actual eating.**
Generating recipes alone is not success.

---

## Product principles

**1. Optimize for execution, not theoretical nutrition.**
A nutritionally perfect meal the user will not cook is a bad recommendation.

**2. Reduce decisions.**
The product should reduce cognitive load, not create more forms, menus, or
choices.

**3. Three options, not infinite discovery.**
This is a decision product, not a recipe discovery feed.

**4. Context matters.**
Recommendations should reflect today's available time, hunger, effort
willingness, craving, ingredients, and budget.

**5. Taste and culture matter.**
"Healthy" should not force users into unfamiliar Western health-food patterns.
Cuisine and taste preferences should meaningfully affect recommendations.

**6. Learn from behavior.**
What users select, reject, actually eat, and repeatedly avoid matters more
than stated preferences alone.

**7. Low friction first.**
Prefer chips, buttons, defaults, and one-tap interactions. Avoid making the
user write long prompts.

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
- normal food budget
- cuisine preferences
- disliked foods
- kitchen equipment
- fridge / storage constraints

**2. Today context** — the dynamic half, re-entered each time:

- available cooking time
- hunger level
- desired effort
- craving
- optional budget override
- ingredients available right now

**3. Exactly 3 recommendations** — no more, no fewer:

1. best overall match
2. lowest-effort option
3. a useful alternative — highest-protein, or simply something different

**4. Select a recommendation** — the user picks one of the three.

**5. Record whether it was actually eaten** — the success event the entire
product is measured by. Everything upstream exists to make this happen.

**6. Basic rejection / feedback reason** — if they did not eat it, why not.
Liked / disliked, and the reason for rejection.

### Extended MVP

Useful early extensions. **Build only after the core loop works end to end:**

- Recipe Inbox / recipe memory — save recipes to try; surface them when the
  current context makes them appropriate. May accept pasted text or URLs.
- Simple pantry
- Meal history
- Favorites
- Recent-meal awareness
- Basic preference learning
- Nutrition target refinement — see below

Having a screen shell for one of these does not make it core. `My Food` and
`Inbox` exist in the navigation today as empty containers; the functionality
inside them is Extended MVP.

#### Nutrition target refinement

Today the profile stores only a protein target. For users with fat-loss or
muscle-building goals, a more useful *daily nutrition envelope* may help
recommendations fit better.

**Guardrail: Food Decision must not become a macro-tracking app.** Targets
exist to shape recommendations, not to make the user log, count, or reconcile
what they ate.

A future profile flow may support:

- **estimated daily calorie target**
- **protein target** — stays the prominent target
- optional carbohydrate target
- optional fat target

Carbohydrate and fat targets are optional and flexible, never mandatory. The
primary product is food decision support, not macro logging.

The calorie suggestion should be derived, not asked for:

```
user characteristics → estimated BMR → estimated total daily energy
expenditure → goal adjustment → suggested daily target
```

BMR is an input to that chain, never the recommended intake itself.

Most users do not know their calorie target, so the UX should offer one rather
than demand one — something like:

```
Calories: ~1,850 / day   [Suggest for me]
```

Like every nutrition number in the product, it is an estimate and should be
shown as one.

---

## Current hypothesis

This is a **hypothesis, not a finding.** Nothing below has been validated with
users yet.

> If we reduce food decision-making to a very low-friction interaction, and
> recommendations fit the user's real context, users will make healthier food
> decisions more often and rely less on expensive convenience food.

## What we need to prove, in order

| Stage | Question |
|---|---|
| 1 | Will the founder personally use this repeatedly instead of deciding meals manually? |
| 2 | Will 5–15 target users use it? |
| 3 | Will any of them return without being reminded? |
| 4 | Does recommendation → actual eating happen repeatedly? |

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
integration · grocery delivery · restaurant ordering · restaurant discovery ·
receipt scanning · barcode scanning · exact pantry quantities ·
expiration-date tracking · Apple Health integration · wearable integration ·
automatic calorie logging · social or community features · family accounts ·
weekly meal planning · recommendation ML models · vector databases ·
complex agent architecture · subscriptions or payments · admin dashboards

---

## Possible future directions

**These are possibilities, not commitments.** None is scheduled. Nothing here
may be built until it has been explicitly promoted into `PLAN.md` NOW or NEXT.

Ordinary Recipe Inbox does **not** appear here — it is an intended early
capability and lives in the Extended MVP above.

- **Grocery intelligence** — recommend meals using local stores, prices,
  sales, and shopping convenience.
- **Advanced recipe importing** — Instagram / TikTok / social recipe
  ingestion, automatic video recipe extraction, browser and share extensions,
  and automatic adaptation of imported recipes to the user's equipment, time,
  goal, and ingredients. Not part of the current MVP.
- **Personal recipe capture** — an important future personalization
  capability; see below.
- **Weekly meal planning** — for users with full kitchens and larger storage,
  help prepare meals in advance around their schedule.
- **Cook / assemble / buy** — compare three kinds of food decision: cook it,
  assemble it with minimal preparation, or buy something nearby.
- **Adaptive preference learning** — learn cuisine preference, effort
  tolerance, ingredient preferences, and meal patterns from actual behavior.
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

