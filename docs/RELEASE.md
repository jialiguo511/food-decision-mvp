# Deploying and operating the public beta

How to deploy this app, what must be configured outside the code, how to run it safely, and what has and has not been verified. Section numbers are referenced from code comments and `supabase/check-schema.sql`, so they are kept stable.

Words used below: **built** (the code exists) · **verified by tests** (an automated test, with what that does and doesn't prove) · **not verified here** (needs a deployment, a signed-in session or a paid account).

---

## 1. What the public beta includes

| area | what exists |
|---|---|
| Product | Sentence entry or step-by-step flow; Cook, Get food and Snack modes plus a cross-way "open" request; exactly three options per request; Adjust, *Show me 3 more*; Choose, Save, "did you eat it?"; first-run setup (allergies, foods to avoid); `/demo` and `/about` public pages; in-app feedback form. |
| Cost and abuse protection | Per-person daily limits, an app-wide daily ceiling per paid call type and an owner's off switch, all enforced in Postgres before the paid call (§6, §7). Paid routes require a session and refuse cross-site POSTs. |
| Security | Row Level Security on every user table; metering and the shared picture cache are server-write-only; same-site-only sign-in redirects; security headers; logs and events carry no free text. |
| Accounts | Magic-link sign-in with resend cooldown and plain-language errors; optional Cloudflare Turnstile; full-page sign-out; *Reset my data* and *Delete my account*. |
| Memory | Last answers per mode ("Last time"), visible and editable. Inferred behavioral hints are **off** (`BEHAVIORAL_HINTS=on` enables them) because there is no screen to see them yet. |

## 2. Verification — what was run, and what it does and doesn't prove

### Automated

| check | what it covers |
|---|---|
| `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` | All pass. The suite is 1,346 tests in 93 files, including real-Postgres tests (PGlite). CI runs the first three on every push and pull request. |
| Two-account isolation (real Postgres engine, the shipped `schema.sql`) | For each user-owned table: user B cannot read, update, delete or insert-as user A; signed-out callers can do none of these; usage and cost tables are unreadable; `release_user_storage` is not callable by users. |
| Cost guard (real Postgres engine, called as `service_role`) | Exactly *N* of 40 simultaneous calls allowed per person; exactly 12 of 60 simultaneous calls across 4 accounts against an app ceiling of 12; a ceiling refusal returns the unit; the off switch stops a kind instantly; signed-in and signed-out callers cannot call `consume_usage` at all. |
| Shared picture cache | Signed-in users can read but not insert, update or delete a `recipe_images` row; the bucket has no insert policy for them; the server-side check refuses a wrong key, type, file signature or size. |
| Migration safety | Every migration applies on a database that already has the schema, in any order and twice, and `check-schema.sql` stays clean. |
| Route tests | Per-person limit, app ceiling, off switch (env and database) and cross-site refusal, each *before* the model or Places is called; failed requests still count. |
| Production build served locally | Security headers present; `/dev/*` and `/api/dev/*` return 404; private and paid routes answer 401 or 404 signed out; the sign-in callback stays on-site for hostile `next` values. |

The database tests run the shipped SQL on a local engine that stubs Supabase's `auth` schema and PostgREST. They do not prove that a particular hosted project was set up from this SQL: run `supabase/check-schema.sql` in the SQL editor for that (§4).

### Real model (a few cents per run)

`OPEN_CONFIRM=1 npm run check:open` and `INTERPRET_CONFIRM=1 npm run check:interpret` re-check the recommender and the sentence reader on real model output: allergy and vegetarian held on every way, zero recipes when cooking is ruled out, no invented ingredients, places or prices, no protein-deficit claim, and prompt-injection attempts. Latest recorded runs: `check:open` 8 of 8 passed; `check:interpret` 17 passed, 0 failed. This is regression evidence, not a corpus of real users' sentences, and it does not judge whether the written reasons read well.

### Not verified here

- Signed-in flows against a deployment (first-run setup, each mode through the real `/api/recommend`, Adjust, *Show me 3 more*, Save, feedback, refresh, sign-out, Reset, Delete) are covered by tests and a stand-in harness; §8 is the manual run.
- Real picture generation and real Pexels or Google results.
- Email delivery, redirect URLs, CAPTCHA pairing and each vendor's own spend caps (dashboard settings, §6).

## 3. Environments

Production: <https://food-decision-mvp.vercel.app/>, deployed from `main`. The deployed commit is shown on `/about` ("build abc1234", from `VERCEL_GIT_COMMIT_SHA`). Locally: `npm run dev` → <http://localhost:3000> (public pages `/demo`, `/about`, `/login`). Dev-only pages (404 in production): `/dev/home` (real Home with a fake network; `?returning=1`, `?failat=1&code=…`) and `/dev/carousel`.

## 4. Database — exactly what to run, in what order

**Run the SQL before the new code serves traffic.** In production the app refuses paid calls when the metering function can't answer, so new code against an old database is safe but unusable (people see "paused for a moment").

1. **Back up first.** Supabase dashboard → *Database → Backups* (or a manual `pg_dump` with the connection string from *Project Settings → Database*). Nothing below deletes data, but have a copy.
2. **Look first (read-only):** paste `supabase/check-schema.sql` → every row says `ok` or `MISSING`.
3. **Run only what's missing** (each file is one transaction and safe to re-run):
   - a project that already has everything through `2026-11-08_release_user_storage.sql` → run, in this order, **`2026-11-09_abuse_guards_and_feedback.sql`** (adds `global_usage`, `app_flags`, `feedback`), then **`2026-11-10_server_only_writes.sql`** (server-only `consume_usage(uuid, text, integer, integer)`; removes the browser's write access to the picture cache);
   - an empty project → `supabase/schema.sql` once (it includes everything; idempotent);
   - do not paste every file in `migrations/` "just in case": harmless (tested) but unnecessary.
4. Run `check-schema.sql` again → expect **no** `MISSING` and **no** `EXPOSED`.
5. **Impact:** no existing table is altered and no row is rewritten or removed. New objects: tables `global_usage`, `app_flags` (owner-only) and `feedback` (own rows only); function `consume_usage(uuid, text, integer, integer)` executable by `service_role` only (the older `(text, integer)` and `(text, integer, integer)` versions are **dropped**). Removed: the browser's insert policy and grant on `recipe_images` and the Storage insert policy on `recipe-images`. Pictures already stored keep working.
   **Order matters:** code from before this change calls the dropped function, so paid calls on an *old* deployment show "unavailable" until the new code is live. Run the SQL, then promote the new deployment, close together.
6. **Optional:** list `recipe_images` rows and delete any you don't trust (the next request regenerates them); they could have been added while writes were open.
7. **Rollback** (only to get the *previous* code running again): the last comment block of the `2026-11-10` file. It restores the weaker state.

"Delete my account" needs `2026-11-08_release_user_storage.sql` and `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Environment variables

Set in Vercel for Production **and** Preview. Nothing secret has a `NEXT_PUBLIC_` prefix. Variables apply to new deployments only, so redeploy after changing one.

| variable | needed | notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | project URL and anon (publishable) key |
| `NEXT_PUBLIC_SITE_URL` | yes | the real https origin |
| `ANTHROPIC_API_KEY` | yes | recommendations, sentence reader, nearby wording |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** (paid calls, picture storage, account deletion) | server-only. Used for the usage meter, storing generated pictures and account deletion, always for the verified session's own id. **Production refuses paid calls without it.** |
| `GOOGLE_PLACES_API_KEY` | for nearby and place photos | restrict to Places API (New) |
| `PEXELS_API_KEY` · `OPENAI_API_KEY` | optional | real dish photos · generated pictures (about $0.005 each, once per dish, shared) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | recommended | enables the CAPTCHA widget on sign-in; **also** enable it in Supabase (§6.3) or it's cosmetic |
| `PAUSED_KINDS` | optional | `all` or `recommend,image,…` — stops those paid calls (needs a redeploy; the SQL switch in §7 is instant) |
| `USAGE_LIMIT_<KIND>` · `USAGE_GLOBAL_<KIND>` | optional | per-person and app-wide daily numbers; defaults in `src/lib/usage/limits.ts` |
| `BEHAVIORAL_HINTS` | leave unset | `on` re-enables inferred hints (not recommended until they can be seen) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | shown on `/about`; public |
| `INTERPRET_MODEL`, `RECOMMEND_MODEL`, `RECOMMEND_EFFORT`, `ENRICH_MODEL` | optional | defaults in code |

Daily numbers (UTC day). **Per person:** 30 suggestion requests, 12 nearby searches, 50 sentences, 30 nearby wordings, 40 pictures, 60 place photos, 5 feedback messages. **Whole app:** 600 suggestions, 150 nearby, 1,500 sentences, 600 wordings, 300 pictures, 1,000 place photos, 200 feedback. A rough worst-case day if every app-wide ceiling were hit is about **$20–25**, derived from per-call cost notes in `docs/PLAN.md`, **not measured**. Lower the ceilings if that is too high.

## 6. What protects spend, and where each layer lives

| layer | where | what it is | caveat |
|---|---|---|---|
| Must be signed in | app | every paid route checks the session first | — |
| Per-person daily limit | **app (Postgres)** | atomic, counted before the call, counted even if the call fails | many accounts multiply it |
| **App-wide daily ceiling** | **app (Postgres)** | same function; bounds total spend whatever the account count | the *app's* line, not a billing cap |
| **Off switch** | **app (Postgres row / env)** | `app_flags.paused_kinds` is instant; `PAUSED_KINDS` after a redeploy | someone has to notice and flip it |
| Cross-site POST refused | app | `Origin` check on paid POST routes | defence in depth on top of SameSite cookies |
| Sign-up friction | **Supabase dashboard + Turnstile** | CAPTCHA on sign-in; Supabase's auth rate limits | **external setting** (§6.3) |
| Email volume | **Supabase dashboard / SMTP provider** | per-hour email limit; the app adds a 60 s resend cooldown (UI only) | external |
| Spend caps | **Anthropic / OpenAI / Google consoles** | the only *hard* money limits | **external setting** (§6.4) |

A budget alert is not a cap. Treat each vendor's spend limit or quota setting as the hard stop and the app's limits as the second line.

### Setup that lives outside the code

1. **Sign-in email.** Supabase's built-in sender is for testing: documented at about 2 emails per hour for the whole project, only to members of your Supabase organization. For real users, configure SMTP (Resend, Postmark, SendGrid…, with a verified domain, SPF and DKIM) under *Authentication → Emails → SMTP Settings*, then raise *Authentication → Rate Limits*. <https://supabase.com/docs/guides/auth/auth-smtp> · <https://supabase.com/docs/guides/auth/rate-limits>
2. **Redirect URLs.** *Authentication → URL Configuration*: Site URL = the production origin; Redirect URLs include `https://<production>/**`, `http://localhost:3000/**` and any Preview origin you test on. Sign-in builds the link from the page you are on, so each origin must be allowed.
3. **CAPTCHA (recommended before public sign-up).** Create a Cloudflare Turnstile widget; put the **site key** in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **secret key** in Supabase → *Authentication → Attack Protection → Enable CAPTCHA protection*. Turn on both or neither: enabled in Supabase without the site key breaks sign-in, and the site key alone does nothing. The widget's *Hostname Management* must list every exact host that serves `/login` (Cloudflare shows a blocked host as error `110200`; each Vercel Preview has its own host). `NEXT_PUBLIC_*` is read at build time, so redeploy after changing the key. The sign-in page prints Cloudflare's error code and a retry; DevTools → Console shows `[turnstile] widget <code> <host>`. <https://supabase.com/docs/guides/auth/auth-captcha>
4. **Vendor spend caps.** Anthropic: a monthly spend limit. OpenAI: a project budget (only if `OPENAI_API_KEY` is set). Google: restrict the key to Places API (New), set a daily quota and a budget alert. Do this before the key sees public traffic.
5. **Vercel:** set §5 variables on Preview and Production; function `maxDuration` is 200 s on `/api/recommend`, 60 s on image and enrich, 30 s on interpret, so check that your plan allows it.
6. **Vendor terms:** this app sends food preferences to Anthropic and a dish description to OpenAI and Pexels; `/about` says so. Read each vendor's data terms and edit `/about` if your setup differs.
7. **Sign-in email templates, and how they go live (required).** One email carries two ways in: a **code** that signs in the browser it is typed in, and a **link** that works from any app (Gmail's built-in browser included). The link opens `/auth/confirm`, which shows a button; only the tap uses the token up (so mail scanners and link previews cannot), and the token travels in the URL *fragment* and then in a POST body, so it is in no server log and no Referer. Supabase sends **two** templates for passwordless sign-in and the docs do not say which a brand-new address gets, so change **both** and test with a never-used email.

   **Step A: add the code, keep the old link** (safe to do first; the current production page ignores the code). *Authentication → Emails → Templates →* **Magic Link** and **Confirm signup**, same body in both:
   ```html
   <h2>Your sign-in code</h2>
   <p>Type this code on the sign-in page: <strong>{{ .Token }}</strong></p>
   <p>Or open the link in the same browser you asked from: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
   <p>The code and the link each work once and expire in 10 minutes. If you didn't ask for this, ignore this email.</p>
   ```
   **Step B: deploy** this branch to production. Links from Step A emails still work in the browser that asked (the confirm page hands an old `?code=` redirect to `/auth/callback`), and the page now shows the code box.

   **Step C: switch the link** to the cross-browser form. Same two templates, new body (`type=email` in Magic Link, **`type=signup` in Confirm signup**):
   ```html
   <h2>Your sign-in code</h2>
   <p>Type this code on the sign-in page, in the browser where you asked for it: <strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email">open the sign-in link</a> from any app. It shows a confirmation page first; nothing is used up until you tap the button there. It signs in whichever browser opens it (the Gmail app's own browser, for one).</p>
   <p>The code and the link each work once and expire in 10 minutes. If you didn't ask for this, ignore this email.</p>
   ```
   Roll back Step C by pasting the Step A body again (no deploy needed).

   **Settings (Authentication → Providers → Email), chosen for brute-force resistance:** *Email OTP Expiration* = `600` (seconds; the default is 3600), *Email OTP Length* = `8` (the page accepts 6–10). *Authentication → Rate Limits → token verifications:* **leave it at the default (30 per 5 minutes per IP). Do not raise it.**

   **Why those numbers.** Supabase's `{{ .TokenHash }}` is a SHA-224 digest of the email address plus the one-time code (GoTrue's `GenerateTokenHash`, from its source history; not re-checked against the current release). So the link token is **not** a 224-bit secret: for a known email, anyone can compute the hash of every possible code and submit each one. The link is exactly as hard to guess as the code is, and the only things stopping a guesser are the code length, the expiry and the rate limit. With 6 digits (10⁶ possibilities), 30 tries per 5 minutes per address and a 10-minute expiry, one address gets 60 tries, about a 0.006 % chance, and 100 addresses about 0.6 %. With 8 digits it is 100 times smaller. Raising the limit to 100 would have made it 3.3 times worse for every address that types codes directly, so it is not recommended. The cost of the low limit is availability, not safety: the confirm route calls Supabase from our server, so everyone's link taps share one 30-per-5-minutes bucket and a flood of junk requests could make link taps fail for a few minutes. The code path is unaffected (it goes browser to Supabase from the person's own address), and the confirm page says to use it. For a small beta with a few sign-ins per hour that is the better side to err on.

   **Needs:** `{{ .RedirectTo }}` is the address the sign-in page passes (`<origin>/auth/confirm`), so each origin must be in *Redirect URLs* (§6.2). An email sent from the Supabase dashboard ("Send magic link") has no such address and its link will not open the confirm page; use the code there.

   **Browser-specific sessions.** Cookies belong to one browser. Tapping the link in the Gmail app signs you in *inside Gmail's browser*, not in Safari or Chrome; the page says so. To sign in your own browser, request the email there and type the code.

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

While paused, people see "unavailable right now" and nothing is counted against them. Today's use against the ceilings: `metrics.sql` queries 9–10. Feedback arrives in `public.feedback` (query 8).

## 8. Acceptance checklist (about ten minutes)

On a phone, against the deployment, signed in with your own email.

1. [ ] `/demo` opens signed out; the "This is an example" banner is visible; tabs switch. `/about` shows the **Public Beta** pill.
2. [ ] `/login` → request → the email carries a link **and a code**. (a) Typing the code signs in the browser you typed it in. (b) Tapping the link in Gmail's mobile app, in Safari and in Chrome each opens a **confirmation page**; nothing happens until you tap **Sign in**, which then signs in that browser. (c) Open the link once, tap **Sign in**, then reopen the same link: it says it was already used. (d) Request with a **never-used email** and repeat (a)–(b): new accounts get the *Confirm signup* template. (e) Wait past 10 minutes: the link and the code both say they expired. **Send another code** counts down.
3. [ ] First run asks only allergies and foods you avoid; **Skip** leaves allergies *unset* (not "none").
4. [ ] Home: type *just trained, very hungry, 20 minutes, I have eggs and rice* → **Help me decide** → a short follow-up only for what you didn't say → three recipes; "Have" shows only eggs, rice and your staples.
5. [ ] On results, **Adjust** → *no more snacks, I'll cook a proper meal* → the request becomes Cook, hunger kept, no return to Home; then *not cooking, buy something ready-made* → buying only; *same, but under $10* → only the budget moves. **Show me 3 more** keeps the conditions. If an Adjust fails, the text and the earlier results stay.
6. [ ] **Get food** → *Eat nearby* → allow location → real places; **Show me 3 more** twice → no place repeats; when nothing new is left it says so.
7. [ ] A sentence like *I can buy something or cook, don't care* → one set mixing Make it / Grab it / Order it.
8. [ ] Cards lead with the reason, then **To buy** (or "Nothing to buy"); the tabs under them jump between cards; **View steps** opens the recipe; **What I understood** is one collapsed line. At 320 px nothing overflows.
9. [ ] **Choose this** → "did you eat it?" → answer. Bookmark a recipe → it is under **Saved**. Refresh → your last results are still there.
10. [ ] Me → add an allergy → ask again → it is respected (not a guarantee). **Send feedback** → check it in `public.feedback`.
11. [ ] **Sign out** → you land on sign-in; browser Back doesn't show your cards. Sign in again.
12. [ ] With a throwaway email: Me → Account & data → **Reset my data** → back to first-run; then **Delete my account** → signing in again starts empty.
13. [ ] On a Preview, set `USAGE_LIMIT_RECOMMEND=2`, redeploy, ask three times → the third says you've reached today's limit. Run the **pause** SQL from §7 → *suggestions are unavailable right now*; un-pause → works.
14. [ ] The commit SHA on the Vercel deployment equals the build shown on `/about`.

## 9. Launch checklist

**Required before inviting people** (settings outside the code):
1. The 2026-11-09 and 2026-11-10 migrations applied (§4), `SUPABASE_SERVICE_ROLE_KEY` set on the deployment, and `check-schema.sql` showing no `MISSING` and no `EXPOSED`.
2. Sign-in email works for non-members (custom SMTP, §6.1), redirect URLs are set (§6.2), and both email templates carry `{{ .Token }}` and the confirm link (§6.7, steps A–C in order).
3. Vendor spend caps set (§6.4).
4. The §8 checklist completed on the deployment.
5. A contact address chosen (`NEXT_PUBLIC_CONTACT_EMAIL`): `/about` promises hand-removal of data only if one is shown.

**Strongly recommended:** Turnstile on (§6.3); app-wide ceilings lowered to what you are comfortable spending in a day.

**Can wait:** a `script-src` Content-Security-Policy (needs nonces; a partial CSP is on); a signed-in smoke test in CI; a per-IP limit on sign-in (Supabase and Turnstile cover it for now); a screen to *see* inferred memory (then re-enable `BEHAVIORAL_HINTS`); a real domain; Plan and Groceries contents.

## 10. Known limits

- The shared picture cache is server-write-only (it used to accept writes from any signed-in user). Pictures stored before `2026-11-10` ran may include one a user added; see §4 step 6.
- The usage meter and picture storage depend on the service-role key being set and correct; if it is missing, production **refuses** paid calls (safe, but the app looks "paused"). It is the first thing to check when everything says "unavailable".
- Allergen checks are literal word matches, never a guarantee. The dietary pattern is checked literally for Cook only.
- Pexels and idea-photo lookups are not metered (free, but a signed-in user could exhaust the vendor's free quota; pictures then fall back gracefully).
- Sign-in email rate limiting is Supabase's plus a UI cooldown; the app can't enforce a per-IP limit because the browser talks to Supabase directly.
- `/auth/confirm/verify` has a per-address limit (5 per 5 minutes) kept in the memory of one server instance: it stops one client hammering the route, but resets on a cold start and is not shared between instances. Supabase's own per-IP verification limit (§6.7, left at its default of 30) is the backstop; and because the link token is only as hard to guess as the code (§6.7), a 6-digit code is the weakest part of this design, which is why 8 digits is recommended; a durable, app-wide limiter would need a table and function.
- The session cookie is `SameSite=Lax` and, over HTTPS, `Secure`, but **not `HttpOnly`**: the browser client reads and clears the session itself (sign-out, and typing the sign-in code). Making it HttpOnly means moving both to the server first; until then a script-injection bug could read the session (frame, base-URI and form-action restrictions are on; a `script-src` policy is not).
- Anyone who can open the sign-in *email* can sign in with its link or code, from any browser. That was already true of the old link in the browser that asked; the link is now also usable elsewhere. It is single-use, expires after 10 minutes (§6.7), and is only as safe as the mailbox.
- The confirm link needs JavaScript (the token is in the fragment, which only a script can read) and a mail app that keeps the end of a link; otherwise the page says the link is incomplete and points to the code.
- "Does it help people decide?" is untested with real users (`docs/PRODUCT.md` proof steps; baseline in `docs/LEARNINGS.md`).
- The sentence reader was exercised on a handful of sentences, not a corpus.
- A user out of today's pictures sees "Picture limit reached" even when the cause is the app-wide ceiling or the pause switch.
- Events and limits use a UTC day; for a US evening user "tomorrow" starts mid-evening.
- The brand name is a placeholder (`src/lib/brand.ts`).
- **Security conclusion, with its edges:** account data is isolated at the database for every table that could be enumerated (tests above), secrets are server-only, inputs and ownership are validated, and logs and events carry no free text. That is the *verified scope*. It is not a claim that the app is "secure" in general: it has not had an external review, and a hosted project's actual configuration is outside what the tests can see.

## 11. When a request fails — how to find out why

Every error panel shows **`Reference 8c763925 · upstream_timeout`** (request id and code; nothing the person typed). In Vercel → project → **Logs**, search the id:

- `[recommend] failed { requestId, code, status, last_stage, stages, total_ms }` — one line per failed request: the code, HTTP status, the last stage reached (`auth`, `usage`, `preferences`, `prompt`, `model`, `parse`, `session_write`…) and every stage's milliseconds. Names, codes and timings only.
- `[Cook timing 8c763925]` — the stage table; `[recommend] model call requestId=… attempt=N` (N = 2: the SDK retried once).

`last_stage: model` at about 45,000 ms → the AI call timed out; `constraint_violation` → the answer broke one of the person's rules (the log says *which kind*, never the food); `session_write` → made but not stored; `bad_response` with no `[recommend] failed` line → the host answered first (gateway timeout or crash page).
