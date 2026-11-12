# Case study — "What should I eat right now?"

A solo-built web app for **food decision fatigue**: you say (or tap) what your evening looks like, and it returns
**exactly three** options that respect your real constraints — allergies, what's in the fridge tonight, time, effort, budget.
Status: **Public Beta** — live at <https://food-decision-mvp.vercel.app/>, built and automatically tested, **not yet validated with real users** — so there are no user numbers here, and none are implied.

Stack: Next.js 15 (App Router) · TypeScript (strict) · Supabase (Postgres, Auth, Row Level Security, Storage) · Anthropic API · Google Places · Vercel.

---

## 1. The problem and who it's for

People don't lack recipes; they lack a *decision*. At 6 pm, tired and a bit hungry, a recipe app gives a hundred options and a
calorie tracker gives a ledger. The question is narrower: **"given my real constraints right now, what should I actually eat?"**

- **Target user (hypothesis, not validated):** someone who cooks some nights and orders on others, eats with a health goal
  or a restriction (allergy, vegetarian…), and loses time or willpower to the decision itself.
- **Success measure:** did they *eat one of the three* — not time in app, not recipe count (`PRODUCT.md`).
- **Deliberately not:** a recipe database, a calorie tracker, a meal planner, an AI nutrition coach.

## 2. 60–90 second demo script

Use the signed-out page `/demo` first (a **labelled static example** — it says so on screen), then the live app.

| time | do | say |
|---|---|---|
| 0:00 | Open `/demo`. Point at the "This is an example" banner. | "Nothing on this page is generated live — it's a fixed walkthrough of what one sentence does." |
| 0:10 | Read the sentence: *"Just trained, very hungry, 20 minutes, I have eggs and rice."* | "One sentence in. The app reads it into structured answers — hunger, time, what I have — and asks only about what I *didn't* say." |
| 0:25 | Tap the tabs under the cards: *Best match · Easiest · Different*. Note the top card says why it wins, the others what they trade against it. | "Always three, each with a different purpose. 'Use what I have' means only eggs, rice and my kitchen staples — never an invented ingredient." |
| 0:45 | Sign in (live), set an allergy in **Me**, ask again. | "Allergies are hard constraints: stated separately in the prompt *and* checked in code on the answer. A set that breaks one is rejected, not softened." |
| 1:05 | Tap **Choose this**, then say whether I ate it. Show **Saved**. | "That 'did you actually eat it' is the signal the product is measured on." |
| 1:20 | Open **Me → Account & data**. | "Reset and delete clear exactly one list of tables, and a test fails if a new table isn't on it." |

## 3. Technical decisions, trade-offs, and the evidence for each

Evidence column says what exists and *what it does not prove*.

| decision | why | trade-off | evidence |
|---|---|---|---|
| **LLM is a function, not a chatbot.** The server builds a structured context; the model returns JSON validated by a schema before any UI sees it. | Predictable UI; a failed answer fails visibly instead of rendering half a card. | No free-form conversation. | zod output schemas; `output.test.ts`, route tests. |
| **Hard constraints enforced twice** — in the prompt, and by a literal word check on the answer (allergen names, dietary pattern, equipment, "no cooking at all"). A violating set is rejected and retried once. | The model is persuasive, not reliable; safety-relevant rules shouldn't rest on it alone. | The check is *literal*: it misses aliases and hidden ingredients. **It is not a safety guarantee**, and the app says so on `/about`. | `textChecks.test.ts`, `allergenCheck.test.ts`; documented gap in `CLAUDE.md`. |
| **"No invented ingredients."** Available = what you typed *tonight* + persistent kitchen staples; "Use what I have" may return fewer than 3 rather than invent one. | Trust: a recipe that quietly assumes an ingredient is worse than a short list. | Sometimes the honest answer is "buy a few things." | `inventory` tests; rule written once in `CLAUDE.md`. |
| **Code picks the places; the model only words them** (nearby search). | A model can hallucinate a restaurant; deterministic ranking can't. Wording arrives after the cards are on screen. | Less "creative" than a model ranking. | `nearbyPicks.test.ts`; the model can't add, drop or reorder a place. |
| **Rules, not a trained model; preferences have provenance** (explicit / remembered / fallback). | One choice isn't a preference; non-selection isn't dislike. Nothing inferred is shown as "your usual". | Slower to "feel smart". Inferred hints are **switched off** in this beta because there's no screen to *see* them (`BEHAVIORAL_HINTS`). | `profileProvenance.test.ts`, `behavior.test.ts`. |
| **Cost control lives in Postgres, before the paid call — and the browser can't touch it.** One atomic function: per-person daily limit **and** an app-wide ceiling **and** an owner's off switch editable without a deploy. A refused call is never charged to the person. The function is executable by the server's service role only, with the user id from the verified session. | A serverless in-memory counter can be raced or reset by a cold start; a per-account limit alone doesn't stop many accounts; and a function a browser can call lets it choose its own limit (an earlier version of this app did — found and closed in review). | Limits are the *app's* line; vendor-side spend caps are still required (see `RELEASE.md`). Production refuses paid calls if the service key is missing. | `usage.realdb.test.ts`: on a real Postgres engine (PGlite), 40 and 60 simultaneous calls against a limit of 10 and a ceiling of 12 let **exactly 10 and exactly 12** through, and a signed-in caller gets a permission error calling it directly. *Local engine, not your Supabase project.* |
| **Data isolation proven at the database, for every user table.** RLS + grants, tested as two users and as signed-out. | The browser holds the anon key by design; RLS *is* the authorization layer. | Tests cover the shipped SQL, not a particular hosted project. | `isolation.realdb.test.ts`: user B can't read, edit, delete or forge user A's rows in all 10 user-owned tables; a new table without a fixture fails the suite. |
| **Shared resources are server-write-only.** Generated dish pictures are cached for everyone, so the browser can read the cache but cannot write it; the server stores a picture only after checking key shape, type, file signature and size. | A shared cache any user can write is a way to put a wrong picture under a dish for everyone (an earlier version allowed it). | The server holds a powerful key, so it is used for three narrow things and never reaches the browser. | `isolation.realdb.test.ts` (insert/update/delete refused for users; storage has no write policy), `recipeImage.test.ts`. |
| **One definition of "a user's data"** drives both Reset and Delete; Storage files a user owns are released so deletion can't be blocked. | A reset account must equal a new one; "delete" must mean delete. | Shared dish pictures stay (they depict a dish, not a person) — disclosed on `/about`. | `accountData.ts` + tests that read the SQL. |
| **Privacy by construction in telemetry and logs.** Product events are names + enumerated values only (schema, SQL `CHECK`, and a size cap); logs carry codes and timings, never text, foods, health data, coordinates, or a database error's quoted row. | You can't leak what you never record. | Less debugging detail; failures carry a short *Reference* id instead. | `events.test.ts`, `logPrivacy.test.ts`. |
| **"No photo beats a wrong photo."** A stock photo is used only if its own description matches the dish *and* the kind of dish. | A sushi photo on a roll-up card breaks trust faster than a blank. | Fewer pictures. | `relevance` tests (written-out descriptions; real Pexels results are checked by hand). |

### Bug found and fixed during hardening (worth telling)

The sign-in callback appended an untrusted `?next=` to the site origin. `next=@evil.example` produces `https://app@evil.example`,
i.e. a redirect to another host *after a legitimate sign-in*. Fixed with a same-site-path allow-list and tests for the attack strings.
A second find: some error logs included a database error's `details`, which for a failed constraint **quotes the whole row**
(age, weight, allergies); those fields are no longer logged.

## 4. Built vs. believed

| | status |
|---|---|
| **Built and automatically tested** | sentence entry + step-by-step; three modes + a cross-way "open" request; hard-constraint validation; saved recipes/places; did-you-eat-it feedback; reset/delete; per-person and app-wide limits with an off switch; feedback form; magic-link sign-in with resend/cooldown and optional CAPTCHA; two-account isolation tests. |
| **Hypotheses — no user evidence yet** | that the three options get *eaten* more than a plain chat answer would; that one sentence beats the taps for most people; that the Claude-Project baseline in `LEARNINGS.md` is beatable. |
| **Not built, on purpose** | habit memory, in-app voice, meal/calorie tracking, a cross-site feedback platform, native apps. |

## 5. What I measured, and under what conditions

- **Automated checks:** typecheck, lint, the test suite (including suites that run the shipped SQL on a real Postgres engine) and the production build all pass on the final tree (`RELEASE.md` §2 has the run and its limits). The count is not the point; what the real-Postgres suites assert is (isolation, the metering function, the cache).
- **Model latency/cost:** one benchmark run, `npm run bench:recommend` output (not committed) — Cook-mode requests,
  `claude-sonnet-5-5`, adaptive thinking at low effort, **n = 2** (one run per case): ~7.6 s median, ~$0.02 per request. Two runs is an
  indication, **not a performance claim**; it hasn't been re-run on a deployed host.
- **Real-model behavior checks** (`npm run check:open`, `check:interpret`): see `RELEASE.md` §2 for what was run in this round.
- **Not measured:** retention, "ate it" rate, real-user latency, cost per active user.

