# Product Learnings

This file records observations and evidence that may change product direction.

Do not treat isolated opinions as validated facts.

---

## Entry template

### Date

### Observation

What actually happened?

### Evidence

Where did this come from?

- founder self-use
- user interview
- user behavior
- analytics
- repeated feedback

### Interpretation

What might this mean?

### Hypothesis

What do we now believe may be true?

### Next test

What is the smallest way to test it?

### Product implication

Does this suggest:

- keep
- change
- remove
- investigate

Do not automatically build something just because it appears here.

---

## Entries

### 2026-09-11 — Founder food decision fatigue

**Status: founder self-observation. Not external validation.**

#### Observation

The founder experiences substantial food decision fatigue. It is not caused by
any single constraint but by the interaction of several at once:

- budget
- limited kitchen equipment
- limited refrigerator / storage
- nutrition goals
- changing appetite
- available time
- ingredients already on hand
- cultural food preference

Each is individually manageable. Held together, the decision becomes expensive
enough that the easiest option often wins.

#### Evidence

Founder self-use only. A single person, reporting on their own experience,
before the product existed. No interviews, no analytics, no external users.

#### Interpretation

The bottleneck may be the *combination* of constraints rather than any one of
them — which would mean solving for nutrition alone, or time alone, would not
help much. It would also suggest the product's job is resolving constraints
against each other, not surfacing more recipes.

This interpretation is untested and drawn from a sample of one.

#### Hypothesis

This is the observation that motivated the initial product hypothesis stated
in `PRODUCT.md`:

> If we reduce food decision-making to a very low-friction interaction, and
> recommendations fit the user's real context, users will make healthier food
> decisions more often and rely less on expensive convenience food.

#### Next test

Stage 1 in `PRODUCT.md`: does the founder use the product repeatedly, for at
least 7 days, instead of deciding meals manually? That is the cheapest
available test and it does not require recruiting anyone.

#### Product implication

**Investigate.** This motivates the MVP but does not validate it. One person's
experience is a reason to build something small and test it — not evidence
that other people share the problem. Stage 2 in `PRODUCT.md` exists precisely
because this entry cannot answer that question.

---

## Nearby Eat out v1 — built, not validated (2026-09-29)

**Current hypothesis, not evidence.** We believe users who normally eat out
decide faster when shown three real nearby places (with a reason and a "what to
look for" hint) than generic food categories. Nothing has been observed yet —
the slice was implemented but not run against a live Google key or used by
anyone. What to watch in founder self-use: does the user actually go to one of
the three; how often is a suggested place wrong or unappealing; how often does
the model return fewer than three; and does open-now/price-level (the
Enterprise-tier fields) change what gets chosen enough to be worth their cost.
