# Web beta — release notes and checklist

Branch `codex/web-beta`. **Nothing here has been deployed.** No production
database, external service or paid account was touched while preparing it. This
file says what is built, what was actually tested, what was not, and exactly
what has to be set up before and during a real release.

Status words used throughout: **built** (the code exists) · **tested locally**
(automated tests, or clicked through in a browser here) · **not verified** (needs
a deployment, a real account, or a paid key this environment didn't have).

---

## 1. What this release is

| area | status |
|---|---|
| One-sentence entry ("Tell me what's going on") beside step-by-step | built · real-model checked · UI clicked through with a stubbed network |
| Carousel picture loading, stable frame, retry | built · client behaviour tested in a real browser and automated · real image generation **not verified** |
| Per-user daily limits on every paid call | built · tested on real Postgres (PGlite) and in route tests · **not run against your Supabase** |
| First-party product events + `supabase/metrics.sql` | built · tested · not run against your Supabase |
| Public `/demo` (static example) and `/about` (privacy, estimates) | built · looked at in a browser |
| Nav = Home / Saved / Me (Plan, Groceries hidden, code kept) | built |
| One brand name everywhere (`src/lib/brand.ts`, placeholder name) | built |
| Voice | **keyboard dictation only** — the box is friendly to a phone keyboard's microphone and says so. No in-app recording, no speech API. |
| Native app, Plan/Groceries, open-ended chat, training load, saved fridge | **not built, on purpose** |

## 2. What was and wasn't verified

Verified here:

- `npm run typecheck`, `npm run lint`, `npm test` (929 tests) and `npm run build` pass.
- The deployment SQL on a real Postgres engine (PGlite): `schema.sql` applies on an empty
  database and again on top of itself; every migration applies on top of it; `check-schema.sql` and
  `metrics.sql` run; the daily-limit function lets exactly N of 40 simultaneous calls through, and a signed-in user
  cannot read, edit or reset their counter.
- The sentence reader against the **real model** (`INTERPRET_CONFIRM=1 npm run check:interpret`, a few cents):
  the three example sentences, a Chinese one, a bare craving (not read as an ingredient), a prompt-injection attempt
  and a fake closing tag (neither can add food or change a rule), gibberish (reads as nothing).
- In a real browser at 390 and 320 px: carousel loading (first card without scrolling, next card ahead of the swipe,
  no repeat request going back and forth, stable height across loading / loaded / failed), sentence → straight to cards,
  sentence → short follow-up → cards, a failed read keeping the text, "what kind of help?", step-by-step, Edit, and the
  public pages. `/dev/*` pages are 404 in the production build.

**Not verified — you need to do these (§6 and the checklist in §7):**

- Anything that needs a signed-in session: the real `/api/recommend` for each mode, Save, "did you eat it", Reset / Delete.
  (Sign-in is a magic link to your own inbox, so it can't be driven from here.) The Home flows above were checked with a
  stand-in for the network, which proves the screens, not the server.
- Real recipe-picture generation: `OPENAI_API_KEY` and `PEXELS_API_KEY` weren't available. The browser checks used a stand-in
  for `/api/image`, so they prove when a card asks, how often, and what each state looks like — not that the vendor returns a picture.
- Real nearby search (a Google key was available locally, but it needs a signed-in session and your location).
- Anything on a deployed host: Vercel limits, Supabase email, redirect URLs, cold starts.

## 3. Test URL

There is no deployed URL yet — you said to hand this over for testing before going live.

- **Locally:** `npm run dev` → <http://localhost:3000>. Public pages (no sign-in): `/demo`, `/about`, `/login`.
  After signing in with your own email: `/today`.
- **Dev-only pages** (404 in production): `/dev/home` (the real Home with a fake network — try `?returning=1`),
  `/dev/carousel` (`?mode=fail|genfail|broken|none&delay=3000`).
- **A preview deployment** is the next step, after §4–§6. I did not create one.

## 4. Database — exactly what to run, in what order

Don't run every file. Pick by what your Supabase project already has.

1. **Look first (read-only).** Paste `supabase/check-schema.sql` into the SQL editor. Every row says `ok` or `MISSING`.
2. **If everything is `ok`:** nothing to run.
3. **If your project is new/empty:** run `supabase/schema.sql` once. It includes everything.
4. **If your project already exists and rows are `MISSING`:** run `supabase/schema.sql` — it's idempotent (verified twice-over on a
   real engine) and only adds what is missing. The narrower alternative, if you want to add *only* the web-beta pieces to a
   database that already has everything through Oct 2:
   `supabase/migrations/2026-11-07_usage_and_events.sql`, then `supabase/migrations/2026-11-08_release_user_storage.sql` (needed for "Delete my account" — see below) — **and nothing else**. The four older migrations are subsets of `schema.sql`
   (place feedback, Saved, recipe images, Saved repair) and are only for a database that lacks them; the profile-v2 columns
   exist only in `schema.sql`, so an old database that is missing them needs `schema.sql`, not a migration file.
5. Run `check-schema.sql` again; expect no `MISSING`.

**Order matters in one way:** do the SQL **before** deploying this code. In production the app refuses every paid request while
`consume_usage()` doesn't exist (so a deploy without the migration is safe, but useless). Do not edit a production database from
anywhere else until you have read the SQL — `schema.sql` is plain text.

**"Delete my account" needs `2026-11-08_release_user_storage.sql` and `SUPABASE_SERVICE_ROLE_KEY`.** Supabase refuses to delete a user who still owns
Storage files ([docs](https://supabase.com/docs/guides/auth/managing-user-data)). A generated recipe picture is uploaded with the signed-in user's own
session, so anyone who caused a picture to be generated could no longer delete their account (found on the first Preview that generated real pictures).
The function releases those shared files (the picture stays; its owner becomes null) just before the auth user is removed; only the service role can call it.
What delete can say, and what each means:

| message | cause | look at |
|---|---|---|
| *Deleting an account isn't set up on this server yet.* | `SUPABASE_SERVICE_ROLE_KEY` isn't visible to that deployment (missing, not ticked for Preview, or added without a redeploy). Nothing was touched. | log `[account] delete refused` |
| *Couldn't delete everything. Your account is still active* | clearing the data tables failed; the login is intact. The data is now cleared with the **user's own** client (like Reset) — the first version used the admin client, and on a project with no blanket table grants `service_role` was refused at the first table. | log `[account] couldn't clear <table> { code, message }` |
| *Your data was cleared, but the account couldn't be removed* | the auth user couldn't be deleted — typically the Storage-ownership case above | log `[account] delete: auth user removal failed` / the migration hint |

The web-beta migration adds two tables and one function. `usage_counters` is deliberately **not** wiped by "Reset my data" (that would
refund a day's allowance) and cascades with the account on delete; `product_events` **is** wiped by reset.

## 5. Environment variables

Set in Vercel (Production and Preview). Nothing secret has a `NEXT_PUBLIC_` prefix.

| variable | needed | notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | the project's URL and anon (publishable) key |
| `NEXT_PUBLIC_SITE_URL` | yes | the real https origin |
| `ANTHROPIC_API_KEY` | yes | recommendations, the sentence reader, nearby wording |
| `SUPABASE_SERVICE_ROLE_KEY` | for "Delete my account" | server-only; without it deletion is refused cleanly. Used for nothing else. |
| `GOOGLE_PLACES_API_KEY` | for nearby search + place photos | restrict it to Places API (New); set a budget alert and quota |
| `PEXELS_API_KEY` | optional | real dish photos; unset → cards fall back to generation, then the placeholder |
| `OPENAI_API_KEY` | optional | generated dish pictures (≈ $0.005 each, once per dish, cached for everyone) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | shown on `/about`; public, so use an address you're happy to publish |
| `INTERPRET_MODEL`, `RECOMMEND_MODEL`, `RECOMMEND_EFFORT`, `ENRICH_MODEL`, `USAGE_LIMIT_*` | optional | defaults are in code (`src/lib/usage/limits.ts` for limits) |

Daily limits per person (UTC day) by default: 30 suggestion requests, 12 nearby searches, 50 sentences, 30 nearby wordings,
40 picture generations, 60 place photos. Rough worst case for one person who uses every allowance in a day: about $1–1.5 (my estimate from the per-call cost notes in `PLAN.md`, not a measured number). Change the limits in one file.

## 6. External services you need to set up

1. **Email for sign-in — this is a blocker for inviting anyone.** Per Supabase's current documentation, the built-in email service
   allows about **2 emails per hour for the whole project** and only delivers to **members of your Supabase organization**; after you set up your own
   SMTP the limit starts low (documented as ~30 per hour) and is adjustable. I could not check your project's live setting — look at
   it: Supabase dashboard → *Authentication → Emails → SMTP Settings* (is "Enable custom SMTP" on?) and *Authentication → Rate Limits*.
   To fix: create an account with an email sender (Resend, Postmark, SendGrid, …), verify a sending domain (SPF/DKIM), then enter host,
   port, username, password and sender in *SMTP Settings*, and raise the email rate limit to something sensible for your first 20–50 invitees.
   Docs: <https://supabase.com/docs/guides/auth/auth-smtp> · <https://supabase.com/docs/guides/auth/rate-limits>
2. **Supabase redirect URLs:** *Authentication → URL Configuration* — set **Site URL** to the production origin and add
   `https://<your-domain>/**` (and `http://localhost:3000/**` for local) to **Redirect URLs**. The sign-in page builds the link from the page you are on, so
   preview deployments need their own entry (or a wildcard you're comfortable with).
3. **Vercel:** import the repo, set the variables above, deploy `codex/web-beta` as a **Preview** first. The image and sentence routes set `maxDuration`
   (60 s and 30 s); check your plan allows it.
4. **Cost guards at the vendors** (the app's own limits are a second line, not the first): a monthly budget/spend cap on Anthropic and OpenAI, and a budget alert +
   daily quota on Google Places (New).
5. **Anthropic / OpenAI / Google terms:** this app sends user food preferences to Anthropic and a dish description to OpenAI/Pexels; `/about` says so.
   Read each vendor's data terms and edit `/about` if your setup differs.

## 7. Ten-minute acceptance checklist

Do this on your phone against the preview URL (§3), signed in with your own email. Tick as you go.

1. [ ] `/demo` opens without signing in; the "Example" labels are visible; the three tabs switch. `/about` opens.
2. [ ] `/login` → request a link → the email arrives within a minute → the link signs you in. *(If not: §6.1.)*
3. [ ] Home leads with **"Tell me what's going on"**; the three example sentences fill the box without sending; **"Or choose step by step"** shows the three modes.
4. [ ] Type: *just trained, very hungry, 20 minutes, I have eggs and rice* → **Help me decide** → it asks only about effort and shopping (not time) → three recipes.
5. [ ] On the results, **What I understood** shows your sentence and chips; tap **Edit** → the usual questions open with answers filled in.
6. [ ] Swipe through the three cards: pictures appear (first card without swiping; the next one shortly after), the frame doesn't jump, and swiping back doesn't reload them.
7. [ ] Type *tired, order something around $15* → straight to ideas (no follow-up). Type *want something sweet* → snack ideas.
8. [ ] Type nonsense (`asdf`) → a clear message, your text is still there, step-by-step still works.
9. [ ] Choose a card → "Nice — this is your pick" → say whether you ate it. Tap the bookmark on a recipe → it appears under **Saved**.
10. [ ] Step by step → **Get food** → *Eat nearby* → allow location → real places; a photo or the neutral placeholder; **Not for me** works.
11. [ ] Me → set an allergy → ask again → it is respected (and remember `/about`: this is not a guarantee).
12. [ ] With a **throwaway email** that has generated a picture: Me → Account & data → Delete my account → you land on the sign-in page, and signing in again starts from an empty account.
13. [ ] After a few requests, run `supabase/metrics.sql` query 3–4 in the SQL editor: your requests are there, with entry and mode, and no text.
14. [ ] To see a limit: set `USAGE_LIMIT_RECOMMEND=2` on the preview, ask three times → the third says you've reached today's limit.
15. [ ] Nav shows only Home / Saved / Me.

## 8. When a request fails — how to find out why

Every error panel shows a small line: **`Reference 8c763925 · upstream_timeout`** (the request id and the error code; nothing from what you
typed). To look it up: Vercel → the project → **Logs** (filter the Preview deployment), search the id. Two things share it:

- `[recommend] failed { requestId, code, status, last_stage, stages, total_ms }` — one line per failed request: which code, which HTTP status, the **last stage it reached**
  (`auth`, `usage`, `preferences`, `prompt`, `model`, `parse`, `session_write`…) and how long every stage took. Names, codes and milliseconds only — no answers, foods, profile, keys or model output.
- `[Cook timing 8c763925]` — the full stage table for the same request, and `[recommend] model call requestId=… attempt=N` lines (N = 2 means the SDK retried once).

Reading it: `last_stage: model` with ~45 000 ms → the AI call timed out; `code: malformed_output` / `constraint_violation` → the answer failed our checks (the rejected output's finding is the
line just above, `[recommend] rejected output`); `session_write` → the cards were made but not stored; a browser error of `bad_response` with *no* `[recommend] failed` line at all → the request never reached
the route's own error handling (the host answered first: a gateway timeout or crash page — check the deployment's function logs for that time).

The first failure reported on the Preview (2026-11-07: *"Couldn't find good options this time"* on the first Generate, fine on the second) could not be traced: the deployment logs were not available to me,
and that wording was the generic fallback used for **every** non-timeout failure, so it didn't identify the cause. If it happens again, send me the Reference line.

## 9. Known gaps (so nobody is surprised)

- Nothing has been used by anyone yet; "does it help people decide?" is untested (proof steps 1–2, `PRODUCT.md`). The Claude Project
  baseline from `LEARNINGS.md` (2026-10-20) is the number to beat.
- Allergen checks are literal word matches — never a guarantee. Dietary pattern is checked literally for Cook only.
- The sentence reader has been exercised on a handful of real sentences, not a corpus. Expect to find phrasing it misses; the follow-up
  screen and step-by-step are the safety net.
- A user out of today's pictures sees "Picture limit reached" even when the real cause is the allowance check failing (rare).
- The brand name is a placeholder (`src/lib/brand.ts`).
- Events and limits use a UTC day; "tomorrow" for a user is a few hours into their evening in the US.
