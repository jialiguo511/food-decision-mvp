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

Proof step 1 in `PRODUCT.md`: does the founder use the product repeatedly, for at
least 7 days, instead of deciding meals manually? That is the cheapest
available test and it does not require recruiting anyone.

#### Product implication

**Investigate.** This motivates the MVP but does not validate it. One person's
experience is a reason to build something small and test it — not evidence
that other people share the problem. Proof step 2 in `PRODUCT.md` exists precisely
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

---

## Strategic reassessment — wedge versus compounding product (2026-10-05)

**Status: founder strategic reasoning. Not evidence, not validation.**

#### Observation

A recommender that works as "user answers a few questions → an LLM returns 3
meals" is easy to reproduce, and a general assistant can already answer "what
should I eat?" if asked. Taken alone, that is a weak product.

#### Evidence

None external. Reasoning about the product's own position; no interviews, no
analytics, no comparison run.

#### Interpretation

If there is a durable advantage, it is more likely to come from **persistent
structured context and decision history** (what the person has, avoids, can
cook with, usually spends, ate recently, keeps rejecting) than from prompt
quality. That advantage only exists if people use the product repeatedly enough
to build history, and only matters if the history measurably improves what they
are shown.

#### Hypothesis

1. Repeated decisions under real constraints are frequent enough to build a
   habit around.
2. A returning user needs **less input** per decision over time, with picks
   staying accepted (`PRODUCT.md` proof step 5).
3. For the same stated context, a user with history gets a different,
   better-accepted set than a new user (proof step 6).

These are strategic hypotheses recorded in `PRODUCT.md` → "Strategy". None has
been observed.

#### Next test

Smallest honest version, during founder self-use: note how many answers and taps
each decision takes in week 1 versus week 2, and whether picks stay accepted.
Separately, for a few real meals, ask a general chatbot with no context and note
what had to be re-explained that this product already knew.

#### Product implication

**Investigate.** Documentation changed (strategy, stages, personalization,
success measures); nothing was promoted into NOW or NEXT, and no code changed.
Do not build learning features because this entry exists — they follow the gates
in `PLAN.md`.

## Post-CrossFit dinner that never got decided (2026-10-20)

**Status: one founder self-observation plus an outside review. Not external
validation.**

#### Observation

After a heavy training day (2.4 km run, 45 toes-to-bar, many deadlifts, plus
~1.5 h of cycling), the founder was cycling home after 7 PM and could not decide
what to eat. Real constraints at that moment:

1. budget — did not want to spend much on eating out or delivery;
2. late — few places open, ready-to-eat food at the store sold out;
3. the fridge was **full**, and some of it would spoil if not eaten;
4. could not buy more — no room to store it;
5. wanted to sleep within a few hours, so wanted nothing heavy, yet needed
   protein and carbohydrate after a high-output day.

The founder **did not open this product**. Filling in a questionnaire-like flow
felt like too much effort in that moment; what they wanted was to say it in a
sentence or by voice. No decision was made for hours; near bedtime, slightly
dizzy, they made their usual salad. They went to bed overfull and slept badly.

The founder also reports a longer pattern: eating only one or two kinds of meal
for stretches of time, and not adjusting food to training load, with slow
recovery as a perceived result.

#### Evidence

- founder self-use (non-use, in fact) on 2026-10-20
- outside review of the idea (Claude, acting as PM / sports-nutrition /
  founder reviewer), 2026-10-21 — opinion, not evidence

#### Interpretation

- **The failure mode was no decision, not a wrong one.** The product lost at
  the moment of opening, before any recommendation existed.
- **Entry cost beats recommendation quality** when the user is tired. Even a
  well-sequenced one-question-at-a-time flow still reads as a questionnaire.
- **Training load is missing context.** After a high-volume day, the useful
  direction is roughly: moderate-to-high carbohydrate, ~30–40 g protein, low
  fat, low fibre, small volume — fast to digest before sleep. The salad that
  was eaten was the opposite (high fibre and volume, low carbohydrate). The
  product currently has no way to know about the workout. (General
  sports-nutrition reasoning, not individual medical advice.)
- **"Use what's about to spoil" was a top constraint**, and the current model
  cannot express it cheaply (see the conflict below).
- **The real competitor is a general assistant with memory**, not tracking
  apps. ChatGPT and Claude both now offer cross-conversation memory, Projects
  holding a standing profile, and voice input. The review's view: this
  product must beat that on (1) zero-effort input, (2) hard constraints
  enforced in code, (3) a structured feedback loop, (4) real-world
  availability (open places, what is actually at home). Elsewhere it is a
  wrapper.

#### Conflict — fridge snapshot vs. re-entering today's food every time

`CLAUDE.md` → "Kitchen staples vs. today's food" says today's food is entered
fresh for each meal and **never saved**, to stop a perishable item ("Chicken")
from being assumed available forever. That rule is sound, and this observation
does not overturn it — but it shows its cost: "my fridge is full and things
will spoil" was one of the strongest constraints, and under the current rule
the user must type the whole fridge again every time, which is exactly the
effort that kept the product closed.

Options, **none chosen**:

| option | what it means | risk |
|---|---|---|
| A. keep the rule, lower the input cost | today's food via one sentence, voice, or a fridge photo, still never saved | still re-entry each meal, just faster |
| B. short-lived fridge snapshot | saved with an expiry (e.g. ~3 days), confirmed in one tap before use ("Still have salmon, spinach…?"), explicitly user-visible and resettable | reintroduces staleness the rule exists to prevent; needs a `PRODUCT.md` change first |
| C. status quo | no change | the observed non-use repeats |

This is a product decision for `PRODUCT.md`, not something to resolve in code.
Until it is decided, the current rule stands.

#### Hypothesis

1. A one-sentence / voice entry that is turned into the existing structured
   context gets the product opened in moments like this one, where the
   current flow does not.
2. Training load is a high-value context signal for carbohydrate and protein
   sizing, plausibly more so than hunger level.
3. For the founder, the product does not yet beat a general assistant with a
   standing profile.

#### Next test

1. **One-week baseline, no code.** Use a Claude Project holding a standing food
   profile, by voice, before every real meal. Record per meal: time to decide,
   whether the suggestion was eaten, and what was annoying or had to be
   re-explained. That list of annoyances is the requirements list; that week is
   the baseline any app version must beat.
2. Then: a natural-language entry over the existing pipeline — promoted to
   `PLAN.md` NEXT on 2026-10-21 at the founder's request; not built.

Gates proposed by the review (not adopted):

| gate | pass | fail means |
|---|---|---|
| founder self-use | 3 weeks, ≥5 meals/week decided with it, >60 % of picks actually eaten, decision < 1 min | stop before involving others |
| small circle | 5–10 similar people (e.g. the founder's CrossFit box), half still using it unprompted in week 4 | need is personal, not shared |
| personalization advantage | after a month, blind comparison beats a from-scratch chatbot on the same situation | memory is not a moat yet |

#### Product implication

**Investigate**, plus one **change** (natural-language entry, promoted to NEXT
2026-10-21, not built) and one open **conflict** (fridge snapshot). No code
changed.
