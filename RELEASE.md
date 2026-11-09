# Public Beta — release notes, verification, and checklist

Branch `codex/web-beta`. **Nothing here has been released to production, and no production database or paid account setting was
changed while preparing it.** This file says what is built, what was *actually* verified (and how), what was not, and exactly what has to
be done by you before and during a real release.

Words used throughout: **built** (the code exists) · **verified here** (automated test, or clicked through in a browser in this environment —
with what that does and doesn't prove) · **not verified** (needs a deployment, a signed-in session, or a paid account this environment didn't have).

---

## 1. What changed in this round (Public Beta hardening)

| area | change |
|---|---|
| Cost / abuse | `consume_usage()` now also enforces an **app-wide daily ceiling per kind** and an **owner's off switch** (edit one row, no deploy). Many sign-ups can no longer multiply the per-person limit. A refused call is never charged to the person. New codes `service_paused` / `nearby_paused`. |
| Security | **Open redirect fixed** in the sign-in callback (`?next=@evil.example`). Cross-site POSTs to paid routes refused (`Origin` check). Security headers (`frame-ancestors`, `nosniff`, referrer, permissions). Server actions validate ids/notes, check the session belongs to the caller, cap text, and no longer return raw database errors. Logs no longer carry a database error's `details` (can quote a whole row) or allergen findings. |
| Data | Two-account isolation test over **every** user-owned table on real Postgres. `feedback` is in Reset / Delete. |
| Memory | **Inferred "behavioral hints" are OFF** (`BEHAVIORAL_HINTS=on` to enable): they shaped results but there is no screen to *see* them (`PLAN.md` known gap). Last-answer defaults ("Last time") are visible and editable, and stay. |
| Accounts | Sign-in: resend with cooldown, "use a different email", plain-language errors, expired-link / wrong-browser notice, optional **Cloudflare Turnstile**. Signed out mid-session → sign-in opens in a **new tab** and *Try again* keeps the answers. Sign-out is a full page load (no cards/pictures left in the tab's memory). |
| Product | `/feedback` form (type, text, optional contact; page path + build version attached; 5/day). `/plan` and `/groceries` redirect Home. "Public Beta" label (sign-in, About). About/privacy text matches the code. |
| Sentence entry | **Found by the real-model check:** since the cross-way change, the headline example *"…I have eggs and rice."* names no single way, so the reader (correctly, by design) leaves `mode` empty and the app made an **open** request — not the Cook flow the demo and checklist showed. And *"Something nearby, around $15"* (cooking ruled out + a named way of getting food) became a generic buy-only open request instead of Eat out. Fixed: that second case is now Eat out (`applyInterpretation`); the Home example chip and `/demo` now say *"I'll cook with the eggs and rice I have"*; the stale `check:interpret` expectations were updated (plus a test that a foods-only sentence stays open). |
| Docs | This file, `CASE_STUDY.md`, README links, `supabase/metrics.sql` owner queries. |

### Final-polish round (2026-11-10) — what changed on top of the above

| area | change |
|---|---|
| **Security: metering is server-only** | `consume_usage()` used to be callable by any signed-in browser with limits *the caller chose* (`p_limit => 1000000`) and could push the app-wide counter. It now takes the user id as an argument and **only `service_role` can execute it**; the app calls it from the server with the verified session's id and its own limits. Production **refuses paid calls without `SUPABASE_SERVICE_ROLE_KEY`**. Tested on real Postgres: signed-in and signed-out callers get a permission error; the old signatures no longer exist. |
| **Security: shared picture cache is server-write-only** | `recipe_images` and the `recipe-images` bucket had insert policies for any signed-in user (a picture could be pre-seeded for any dish). Now there is **no insert grant/policy for the browser** (table and Storage); the server writes with the service role after checking key shape, content type, file signature and size (≤ 1 MB). Without the service key no picture is generated (so no paid generation can go uncached). Tested on real Postgres. |
| Migrations | one new file, **`2026-11-10_server_only_writes.sql`**, with impact, order and rollback in its header. The older migrations (`2026-10-02`, `2026-11-07`, `2026-11-09`) were edited so re-running any of them **cannot re-open** either hole; a test applies them in a shuffled order and `check-schema.sql` stays clean. `check-schema.sql` now reports `EXPOSED` if the browser could execute `consume_usage` or write the cache. |
| Cards | reason first (for the top card: *why it wins* from what you said; for the others: *what it trades against it* — prompt rule, no invented scores), then **To buy** (or "Nothing to buy"), then estimates. Steps are under **View steps**. |
| Carousel | named tabs (*Best match · Easiest · Different*, per way) show where you are and what each option is for; swipe, tap, or arrows on wide screens. |
| Summary | "What I understood" is one collapsed line with **View / edit**; the public example opens it. |
| Home | one scrolling row of short examples (incl. *Cook or buy, either*) instead of three tall ones; shorter helper text so the box and button fit the first screen at 320 px. |
| Sign-in check | the Turnstile widget shows Cloudflare's real error code and a retry (see §6.3); a blocked host (`110200`) is a Cloudflare hostname setting, not a code bug. |

## 2. Verification — what was run, and what it does and doesn't prove

### Automated (run on this branch, in this environment)

| check | result |
|---|---|
| `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` | **all pass** on the final tree: 1295 tests in 90 files (2026-11-10). The real-Postgres tests (PGlite) are part of that run. |
| Two-account isolation, real Postgres engine (PGlite) running the real `schema.sql` | for each of the 10 user-owned tables: user B cannot read, update, delete or insert-as user A; signed-out (`anon`) can do neither; usage/cost tables unreadable; `release_user_storage` not callable by users |
| Cost guard, real Postgres engine (called as `service_role`, as the server does) | exactly N of 40 simultaneous calls allowed per person; exactly 12 of 60 simultaneous calls across 4 accounts allowed against an app ceiling of 12; ceiling refusal gives the unit back; off switch stops a kind instantly; users can't read or edit counters/flags; **signed-in and signed-out callers cannot call `consume_usage` at all** (permission error), and only the 4-argument version exists |
| Shared picture cache, real Postgres engine | signed-in users can read but not insert / pre-seed / update / delete a `recipe_images` row; no insert policy on the bucket for them; the service role can store; the server-side check refuses a wrong key, type, file signature or size before upload (unit test) |
| Migration safety | every migration applies on a database that already has the schema, in any order and twice, and `check-schema.sql` stays clean (no `MISSING`, no `EXPOSED`) — so re-running an old one can't re-open the closed holes |
| Route tests (in-memory DB) | per-person limit, app ceiling, off switch (env and DB), cross-site refusal — each **before** the model / Places is called; failed requests still count |
| Production build served locally | security headers present; `/dev/*` and `/api/dev/*` → 404; every private/paid route answers 401/404 signed-out; `/auth/callback?next=@evil.example` stays on-site; `/login`, `/about`, `/demo` look right at 375 px |
| Real Home UI, stand-in network (`/dev/home`) | signed-out failure → new copy and *Sign in (opens a new tab)*; *Try again* then succeeds and the failure notice is gone |

**What the database tests do *not* prove:** they run the shipped SQL on a local engine that stubs Supabase's `auth` schema and PostgREST. They
do not prove that *your* Supabase project was set up from this file — run `supabase/check-schema.sql` in the SQL editor for that (§4).

### Real model (a few cents; run in this round)

See §2a at the end of this file for what `check:open` and `check:interpret` returned. These re-check that the recommender and the sentence reader
still behave on real model output (allergy, no-cooking, no invented ingredients, prompt-injection attempts). The prompts were **not** changed in
this round; this is regression evidence, not new capability.

### Not verified — I could not do these here

- **Anything signed in, against a deployment.** Sign-in is a magic link to an inbox I don't have, there is no service-role key or Vercel/Supabase access
  in this environment, and I was not given the Preview URL. So **the real flows on a deployed host — first-run setup, each mode through the real
  `/api/recommend`, Change, "Show me 3 more", Save, "did you eat it", refresh, sign-out, Reset, Delete — are covered by tests and the stand-in
  harness, not by a live run.** The checklist in §8 is that run, for you.
- Real picture generation and real Pexels/Google results (needs `OPENAI_API_KEY`, `PEXELS_API_KEY`, and a signed-in session).
- Supabase email delivery, redirect URLs, Turnstile/CAPTCHA enforcement, the vendors' own spend caps.
- Whether the Preview's deployed commit equals the pushed commit: I can't read the Vercel dashboard. Compare the SHA on the Vercel deployment page with `git rev-parse --short HEAD` (checklist item 14).

## 3. Test URL

Preview given by you: `food-decision-cpthglww5-jialiguo511.vercel.app` (commit `d1c4c19`, older than this round) and later `food-decision-rbygo54a4-jialiguo511.vercel.app`. I read the first one's response headers anonymously (security headers present; its bundle was built **without** the Turnstile site key, so it showed no widget). The **deployed commit is now visible on `/about`** ("build abc1234", from `VERCEL_GIT_COMMIT_SHA`): compare it with `git rev-parse --short HEAD`. **Locally:** `npm run dev` → <http://localhost:3000> (public: `/demo`, `/about`, `/login`).
Dev-only pages (404 in production): `/dev/home` (real Home with a fake network; `?returning=1`, `?failat=1&code=…`), `/dev/carousel`.
**Preview:** pushing `codex/web-beta` should build a Vercel Preview if the repo is connected — read its URL and commit SHA on the Vercel dashboard.

## 4. Database — exactly what to run, in what order

**Do the SQL before the new code serves traffic.** In production the app refuses paid calls when the metering function can't answer, so new code
against an old database is safe but unusable (people see "paused for a moment").

1. **Back up first.** Supabase dashboard → *Database → Backups* (or *Project Settings → Database → Backups*; on the free plan take a manual dump:
   `pg_dump` with the connection string from *Project Settings → Database*). Nothing below deletes data, but you should have it.
2. **Look first (read-only):** paste `supabase/check-schema.sql` → every row says `ok` or `MISSING`.
3. **Run only what's missing** (each file is one transaction and safe to re-run):
   - project already has everything through `2026-11-08_release_user_storage.sql` → run, **in this order**,
     **`2026-11-09_abuse_guards_and_feedback.sql`** (adds `global_usage`, `app_flags`, `feedback`) then
     **`2026-11-10_server_only_writes.sql`** (the new server-only `consume_usage(uuid, text, integer, integer)`; removes the browser's write access to the picture cache).
   - empty project → `supabase/schema.sql` once (it includes everything; idempotent).
   - Do **not** paste every file in `migrations/` "just in case": that is now harmless (tested) but unnecessary.
4. Run `check-schema.sql` again → expect **no** `MISSING` and **no** `EXPOSED`.
5. **Impact:** no existing table is altered and no row rewritten or removed. New objects: tables `global_usage`, `app_flags` (owner-only), `feedback` (own rows only); function
   `consume_usage(uuid, text, integer, integer)` executable by `service_role` only (the older `(text, integer)` and `(text, integer, integer)` are **dropped**). Removed: the browser's insert
   policy/grant on `recipe_images` and the Storage insert policy on `recipe-images`. Pictures already stored keep working.
   **Order matters:** code from before this round calls the old function, which is dropped — paid calls on that *old* deployment show "unavailable" until the new code is live. Run the SQL, then promote the new deployment, close together.
6. **Optional after running** (header of the 11-10 file): list `recipe_images` rows and delete any you don't trust (the next request regenerates them) — they could have been added while writes were open.
7. **Rollback** (if ever needed): in the 11-10 file's last comment block. It restores the weaker state; use it only to get the *previous* code running again.

"Delete my account" still needs `2026-11-08_release_user_storage.sql` and `SUPABASE_SERVICE_ROLE_KEY` (unchanged; table of failure messages in git history of this file and in `account.actions.ts`).

## 5. Environment variables

Set in Vercel (Production **and** Preview). Nothing secret has a `NEXT_PUBLIC_` prefix. After changing a variable, **redeploy** — Vercel applies variables to new deployments only.

| variable | needed | notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | project URL and anon (publishable) key |
| `NEXT_PUBLIC_SITE_URL` | yes | the real https origin |
| `ANTHROPIC_API_KEY` | yes | recommendations, sentence reader, nearby wording |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** (paid calls, picture storage, "Delete my account") | server-only, never `NEXT_PUBLIC_`; used for the usage meter, storing generated pictures, and account deletion — always for the verified session's own id. **Production refuses paid calls without it.** Supabase → Project Settings → API → `service_role` (a secret key) |
| `GOOGLE_PLACES_API_KEY` | for nearby + place photos | restrict to Places API (New) |
| `PEXELS_API_KEY` · `OPENAI_API_KEY` | optional | real dish photos · generated pictures (≈ $0.005 each, once per dish, shared) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | recommended | enables the CAPTCHA widget on sign-in; **also** enable it in Supabase (§6.3) or it's cosmetic |
| `PAUSED_KINDS` | optional | `all` or `recommend,image,…` — stops those paid calls (needs a redeploy; the SQL switch in §7 is instant) |
| `USAGE_LIMIT_<KIND>` · `USAGE_GLOBAL_<KIND>` | optional | per-person and app-wide daily numbers; defaults in `src/lib/usage/limits.ts` |
| `BEHAVIORAL_HINTS` | leave unset | `on` re-enables inferred hints (not recommended until they can be seen) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | shown on `/about`; public |
| `INTERPRET_MODEL`, `RECOMMEND_MODEL`, `RECOMMEND_EFFORT`, `ENRICH_MODEL` | optional | defaults in code |

Daily numbers (UTC day). **Per person:** 30 suggestion requests, 12 nearby searches, 50 sentences, 30 nearby wordings, 40 pictures, 60 place photos, 5 feedback messages.
**Whole app:** 600 suggestions, 150 nearby, 1500 sentences, 600 wordings, 300 pictures, 1000 place photos, 200 feedback.
My estimate of the worst-case day if every app-wide ceiling were hit is **roughly $20–25** (600 × ~$0.02 + 150 nearby searches at a few cents + pictures ≈ $1.5); that is derived from
`PLAN.md`'s per-call notes, **not measured**. Lower the ceilings if that's too high for you.

## 6. What protects spend, and where each layer lives

| layer | where | what it is | caveat |
|---|---|---|---|
| Must be signed in | app | every paid route checks the session first | — |
| Per-person daily limit | **app (Postgres)** | atomic, counted before the call, counted even if the call fails | an attacker with many accounts multiplies it |
| **App-wide daily ceiling** | **app (Postgres)** | same function; bounds total spend whatever the account count | the *app's* line, not a billing cap |
| **Off switch** | **app (Postgres row / env)** | `app_flags.paused_kinds` instant; `PAUSED_KINDS` after a redeploy | you have to notice and flip it |
| Cross-site POST refused | app | `Origin` check on paid POST routes | defence in depth on top of SameSite cookies |
| Sign-up friction | **Supabase dashboard + Turnstile** | CAPTCHA on sign-in; Supabase's auth rate limits | **external — you configure it** (§6.3) |
| Email volume | **Supabase dashboard / SMTP provider** | per-hour email limit; the app adds a 60 s resend cooldown (UI only) | external |
| Spend caps | **Anthropic / OpenAI / Google consoles** | the only *hard* money limits | **external — see below** |

A **budget alert is not a cap.** Treat each vendor's *spend limit / quota* setting as the hard stop and the app's limits as the second line.

### Setup only you can do (blocking unless marked)

1. **Sign-in email (blocking for inviting anyone).** Supabase's built-in email sender is for testing: documented at about **2 emails per hour for the whole project**, only to
   members of your Supabase organization. Configure SMTP (Resend/Postmark/SendGrid…, with a verified domain/SPF/DKIM) in *Authentication → Emails → SMTP Settings*, then raise
   *Authentication → Rate Limits* to something sensible. <https://supabase.com/docs/guides/auth/auth-smtp> · <https://supabase.com/docs/guides/auth/rate-limits>
2. **Redirect URLs (blocking).** *Authentication → URL Configuration*: Site URL = production origin; Redirect URLs include `https://<production>/**`, `http://localhost:3000/**`,
   and the Preview's origin (or a wildcard you're comfortable with). Sign-in builds the link from the page you are on, so each origin must be allowed.
3. **CAPTCHA (recommended before public sign-up).** Cloudflare Turnstile is free: create a widget, put the **site key** in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and put the **secret key** in
   Supabase → *Authentication → Attack Protection → Enable CAPTCHA protection*. Turn on both or neither: enabled in Supabase without the site key breaks sign-in; the site key alone
   does nothing. **The widget's *Hostname Management* must list every exact host that serves `/login`** — Cloudflare shows a blocked host as "Unable to connect to website" (error `110200`),
   and each Vercel Preview deployment has its own host (`<project>-<hash>-<team>.vercel.app`); use the stable branch alias or add each host you test on. `NEXT_PUBLIC_*` is read at build time:
   change the key, then redeploy. The sign-in page now prints Cloudflare's actual error code and a retry; to read it yourself, open DevTools → Console on `/login` and look for `[turnstile] widget <code> <host>`. <https://supabase.com/docs/guides/auth/auth-captcha>
4. **Vendor spend caps (blocking).** Anthropic: a monthly spend limit. OpenAI: a project budget/limit (only if `OPENAI_API_KEY` is set). Google: restrict the key to Places API (New) and set a quota
   per day plus a budget alert. Do this before the key sees public traffic.
5. **Vercel:** set §5 variables on Preview and Production; function `maxDuration` is 200 s on `/api/recommend`, 60 s on image/enrich, 30 s on interpret — check your plan allows it.
6. **Vendor terms:** this app sends food preferences to Anthropic and a dish description to OpenAI/Pexels; `/about` says so. Read each vendor's data terms and edit `/about` if your setup differs.

## 7. Running the beta — the off switch and what to watch

Paste into the Supabase SQL editor (these run as owner; the app never can). Full queries: `supabase/metrics.sql`.

```sql
-- STOP every paid call now (takes effect on the next request, no deploy):
update public.app_flags set value = 'all' where key = 'paused_kinds';
-- stop only some kinds (recommend, nearby, interpret, enrich, image, place_photo, feedback):
update public.app_flags set value = 'recommend,image' where key = 'paused_kinds';
-- back on:
update public.app_flags set value = '' where key = 'paused_kinds';
```
While paused, people see "unavailable right now" and nothing is counted against them. To see today's use against the ceilings: `metrics.sql` queries 9–10.
Feedback arrives in `public.feedback` (query 8).

## 8. Ten-minute acceptance checklist

Phone, against the Preview URL, signed in with your own email. Tick as you go.

1. [ ] `/demo` opens signed-out; the "This is an example" banner is visible; tabs switch. `/about` shows the **Public Beta** pill.
2. [ ] `/login` → request a link → email arrives → link signs you in. *(If not: §6 step 1.)* Use **Send another link** (timer counts down). Open an old/used link → you get the "didn't work… same browser" notice.
3. [ ] First run asks only allergies / foods you avoid; **Skip** works and leaves allergies *unset* (not "none").
4. [ ] Home: type *just trained, very hungry, 20 minutes, I have eggs and rice* → **Help me decide** → short follow-up only for what you didn't say → three recipes; "Have" shows only eggs, rice and your staples.
5. [ ] **Edit** → the usual questions open with answers filled in; **Change** on a typed request returns to the text, still editable.
6. [ ] Step by step → **Get food** → *Eat nearby* → allow location → real places; **Show me 3 more** twice → no place repeats; when nothing new is left it says so.
7. [ ] **Make or buy, either is fine** typed as a sentence (e.g. *I can buy something or cook, don't care*) → one set mixing Make it / Grab it / Order it.
8. [ ] Cards lead with the reason, then **To buy** (or "Nothing to buy"); the tabs under them (*Best match · Easiest · Different*) jump between cards; **View steps** opens the recipe; **What I understood** is one collapsed line that opens with **View / edit**. Swipe the cards: pictures load without layout jumping; a card with no picture is still usable. Try 320 px wide (browser devtools) — nothing overflows.
9. [ ] **Choose this** → "did you eat it?" → answer. Bookmark a recipe → it's under **Saved**. Refresh the page → your last results are still there.
10. [ ] Me → add an allergy → ask again → it's respected (remember: not a guarantee). **Send feedback** (Me, or *Report a problem* on an error panel) → check it in `public.feedback`.
11. [ ] **Sign out** → you land on sign-in; browser Back doesn't show your cards. Sign in again.
12. [ ] With a throwaway email: Me → Account & data → **Reset my data** → back to first-run; then **Delete my account** → signing in again starts empty.
13. [ ] Set `USAGE_LIMIT_RECOMMEND=2` on the Preview, redeploy, ask three times → the third says you've reached today's limit. Then run the **pause** SQL from §7 → *suggestions are unavailable right now*; un-pause → works.
14. [ ] On the Vercel deployment page, the commit SHA equals `git rev-parse --short HEAD` of this branch.

## 9. Release blockers vs. deferrable

**Blocks a public release (needs you):**
1. Run the 2026-11-09 **and** 2026-11-10 migrations (§4), set `SUPABASE_SERVICE_ROLE_KEY` on the deployment, and confirm `check-schema.sql` shows no `MISSING` and no `EXPOSED`.
2. Sign-in email works for non-members (custom SMTP, §6.1) and redirect URLs are set (§6.2).
3. Vendor spend caps set (§6.4).
4. You complete the §8 checklist on the Preview (the live, signed-in run I couldn't do).
5. Decide the contact address (`NEXT_PUBLIC_CONTACT_EMAIL`) — `/about` promises hand-removal only if one is shown.

**Strongly recommended, not strictly blocking:** Turnstile on (§6.3); lower the app-wide ceilings to what you're comfortable losing in a day.

**Can wait:** a script-src Content-Security-Policy (needs nonces; partial CSP is on); a signed-in smoke test in CI; a per-IP limit on sign-in (Supabase + Turnstile cover it for now);
a screen to *see* inferred memory (then re-enable `BEHAVIORAL_HINTS`); a real domain, and Plan/Groceries contents.

## 10. Known limits (so nobody is surprised)

- **Shared picture cache is server-write-only now** (was: any signed-in user could pre-seed it). Remaining edge: pictures stored **before** `2026-11-10` ran may include one a user added — see §4 step 6 to review them.
- The usage meter and picture storage depend on the service-role key being set and correct; if it is missing, production **refuses** paid calls (safe, but the app looks "paused") — the first thing to check when everything says "unavailable".
- Allergen checks are literal word matches — never a guarantee. Dietary pattern is checked literally for Cook only.
- Pexels/idea-photo lookups are not metered (free, but a signed-in user could exhaust the vendor's free quota; pictures then fall back gracefully).
- Sign-in email rate limiting is Supabase's plus a UI cooldown; the app can't enforce a per-IP limit because the browser talks to Supabase directly.
- Nothing has been used by anyone yet; "does it help people decide?" is untested (`PRODUCT.md` proof steps; baseline in `LEARNINGS.md`).
- The sentence reader was exercised on a handful of sentences, not a corpus.
- A user out of today's pictures sees "Picture limit reached" even when the cause is the app-wide ceiling or the pause switch.
- Events and limits use a UTC day; for a US evening user "tomorrow" starts mid-evening.
- The brand name is a placeholder (`src/lib/brand.ts`).
- **Security conclusion, with its edges:** account data is isolated at the database for every table I could enumerate (tests above), secrets are server-only, inputs and ownership are
  validated, and logs/events carry no free text. That is the *verified scope*; it is not a claim that the app is "secure" in general — it hasn't had an external review, and the
  hosted project's actual configuration is the part I can't see.

## 11. When a request fails — how to find out why

Every error panel shows **`Reference 8c763925 · upstream_timeout`** (request id + code; nothing you typed). Vercel → project → **Logs** → search the id:

- `[recommend] failed { requestId, code, status, last_stage, stages, total_ms }` — one line per failed request: the code, HTTP status, the last stage reached
  (`auth`, `usage`, `preferences`, `prompt`, `model`, `parse`, `session_write`…) and every stage's milliseconds. Names, codes and timings only.
- `[Cook timing 8c763925]` — the stage table; `[recommend] model call requestId=… attempt=N` (N = 2: the SDK retried once).

`last_stage: model` at ~45 000 ms → the AI call timed out; `constraint_violation` → the answer broke one of your rules (the log says *which kind*, never the food); `session_write` → made but not stored;
`bad_response` with no `[recommend] failed` line → the host answered first (gateway timeout/crash page).

---

## 2a. Real-model checks run in this round (2026-11-09)

Run with the key in `.env.local`, a few cents in total. Prompts were unchanged.

- `OPEN_CONFIRM=1 npm run check:open` — **8 of 8 passed** (≈ 80 s): cross-way sets mixing recipe / order / snack; zero recipes when cooking is ruled out; no invented ingredients, places or prices; no protein-deficit claim; allergy and vegetarian held on every way.
- `INTERPRET_CONFIRM=1 npm run check:interpret` — first run **14 passed, 2 failed**: the two failures were the stale expectations described in §1 (a real behavior mismatch, not model flakiness). After the fix: **17 passed, 0 failed** (8 skipped = the other script's gate, `OPEN_CONFIRM`).
- What this does **not** show: results on a corpus of real users' sentences, latency on a deployed host, or anything about image generation.
- **Final-polish round (2026-11-10):** the cook/order/snack prompts gained one rule (top card says why it wins from what you said; the others say what they trade against it; no invented scores). `OPEN_CONFIRM=1 npm run check:open` again **8 of 8 passed** (≈ 80 s) — the hard rules (allergy, no cooking, no invented ingredients/places/prices) still hold. It does **not** judge whether the new reasons *read* well; read the "reason" lines on your first few real results (checklist 4).

