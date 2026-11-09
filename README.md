# Food Decision MVP

"What should I actually eat right now?" — three options, chosen for the
constraints you actually have tonight.

## Product documentation

| file | what it covers |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Product thesis, strategy (wedge vs. long-term product), target user, principles, success measures, MVP, non-goals |
| [`PLAN.md`](PLAN.md) | Current roadmap — NOW / NEXT / LATER / NOT NOW, plus the four strategic stages |
| [`PERSONALIZATION.md`](PERSONALIZATION.md) | How the product remembers and learns — explicit, routine, behavioral memory |
| [`CLAUDE.md`](CLAUDE.md) | Coding and product rules for AI-assisted development |
| [`LEARNINGS.md`](LEARNINGS.md) | Evidence and product learnings |
| [`RELEASE.md`](RELEASE.md) | **Public Beta: what's built, what was and wasn't verified, migrations, env vars, external setup, the off switch, 10-minute acceptance checklist, release blockers** |
| [`CASE_STUDY.md`](CASE_STUDY.md) | Project write-up: the problem, a 60–90 s demo script, technical decisions with evidence and their limits, built vs. unvalidated, resume text |

---

## Run it locally

You need Node 18.18+ (check with `node --version`).

### 1. Install dependencies

```bash
cd food-decision-mvp
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Open the **SQL Editor**, paste the entire contents of `supabase/schema.sql`,
   and hit **Run**. This creates every table, function and security policy. It is
   idempotent (checked on a real Postgres by `src/test/schema.realdb.test.ts`):
   re-running it only adds what is missing.
   **For an existing database,** first run the read-only `supabase/check-schema.sql`
   to see what is missing, then follow `RELEASE.md` §4 — don't run every file in
   `supabase/migrations/` (they are subsets of `schema.sql`).
3. Go to **Project Settings → API** and copy the **Project URL** and the
   **anon public** key.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste in your URL and anon key. Leave
`NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local development.

> The anon key is *meant* to be public — it identifies your project, it doesn't
> grant access. Row Level Security in Postgres is what keeps one user from
> reading another's rows. Anything genuinely secret (the LLM key, later) has no
> `NEXT_PUBLIC_` prefix, which is how Next.js knows never to send it to the
> browser.

### 3b. Nearby places (optional)

"Find food near me" (Home → "I want to order food") searches real nearby
restaurants and cafés with the **Google Places API (New)**. Without a key
everything else works, and that button explains that nearby search isn't set
up.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or
   pick a project and **enable billing** (Google requires it, even for the free
   monthly allowance).
2. **APIs & Services → Library → "Places API (New)" → Enable.** Make sure it is
   the *(New)* one, not the legacy "Places API".
3. **APIs & Services → Credentials → Create credentials → API key.** Then
   restrict it: **API restrictions → Places API (New)** only. (Application
   restrictions by HTTP referrer don't work for server-side calls; leave those
   unrestricted or use IP restrictions if you deploy to fixed IPs.)
4. Put it in `.env.local` as `GOOGLE_PLACES_API_KEY=...` — no `NEXT_PUBLIC_`
   prefix, and never commit it. On Vercel, add the same variable and redeploy.
5. Each tap is one Nearby Search request (up to 20 places). The field mask
   intentionally includes Enterprise-tier fields (open-now, price level, and website)
   for MVP usefulness, so each request bills at the Enterprise tier. That is a
   deliberate cost/utility tradeoff, centralized in `src/lib/places/config.ts`
   so it can be changed later — revisit it if usage scales.
6. **Before any public launch,** set project-level protections in the Google
   Cloud console: a budget alert, and a per-day quota cap on the Places API
   (New). The app makes at most one request per explicit tap and never retries
   or polls on its own, but it has no rate limiter of its own — the Cloud quota
   is the backstop.

Location is requested by the browser only when you tap **Find food near me**,
is used for that one search, and is never saved. The browser only shares
location on `https://` or `localhost` — for phone testing use your deployed
URL or a tunnel, not `http://<your-LAN-IP>:3000`.

### 3c. Other optional keys

`ANTHROPIC_API_KEY` powers the recommendations and the one-sentence entry.
`PEXELS_API_KEY` / `OPENAI_API_KEY` add recipe pictures. `USAGE_LIMIT_*` change the
per-person daily limits on paid calls (defaults in `src/lib/usage/limits.ts`).
See `.env.local.example`.

### 4. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be sent to `/login`.

`npm run dev` clears stale `.next` development manifests before startup and
uses Turbopack. This avoids the intermittent Webpack React Client Manifest
desynchronization seen after long Fast Refresh sessions. The old Webpack
server remains available as `npm run dev:webpack` only for troubleshooting.

### 5. Sign in

Enter your email and click the button. Supabase emails you a one-time link.

- The built-in Supabase email sender is for trying things yourself: per Supabase's
  docs it allows about 2 emails an hour for the whole project and only sends to
  members of your organization. **To invite anyone else you must set up your own SMTP**
  (`RELEASE.md` §6). If the email is slow while developing, open Supabase →
  **Authentication → Users** and use "Send magic link", or add yourself there manually.
- Make sure `http://localhost:3000/**` is listed under
  **Authentication → URL Configuration → Redirect URLs**.

After clicking the link you land on `/today` (labelled **Home** in the app).
Tap **Me** in the bottom bar to set your Food Profile.

---

## What to look at

| URL | State |
|---|---|
| `/login` | Magic-link sign-in |
| `/demo` | **Built** — public, static, clearly-labelled example walkthrough (no sign-in, no model, no data) |
| `/about` | **Built** — public: privacy, what leaves the app, estimates, no safety guarantee |
| **`/today`** (Home) | **Built** — say what's going on in a sentence, *or* choose step by step (Make something / Get food / Grab a snack); then three recommendations |
| `/plan`, `/groceries` | Placeholder containers (not built) — **not linked from the nav** in the web beta |
| **`/saved`** | **Built** — recipes and places you saved to come back to |
| **`/profile`** (Me) | **Built** — Food Profile, Kitchen staples, account & data |

The earlier `/results`, `/inbox` and `/my-food` routes were removed; see
`PLAN.md`. Where the product is headed — and what is deliberately *not* built
yet — is in `PRODUCT.md` → "Strategy".

To confirm the profile actually persists: set some chips, press **Save
profile**, reload the page — the choices come back. Then look at
**Table Editor → profiles** in Supabase and you'll see your row.

---

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # unit + route + real-Postgres (PGlite) tests
npm run build       # full production build

# Costs real (small) money and needs ANTHROPIC_API_KEY — never part of `npm test`:
INTERPRET_CONFIRM=1 npm run check:interpret   # the sentence reader, on the real model
BENCH_CONFIRM=1 npm run bench:recommend       # recommender model benchmark
```

Dev-only pages (404 in production): `/dev/home` (the real Home with a fake network,
`?returning=1` for a returning user) and `/dev/carousel` (picture loading; add
`?mode=fail|genfail|broken|none&delay=3000`).

---

## Deploy (when you're ready)

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add
the same environment variables in the Vercel project settings — with
`NEXT_PUBLIC_SITE_URL` set to your real domain. Then add
`https://your-app.vercel.app/**` to Supabase's redirect URL list.

**Before anyone but you uses it, read `RELEASE.md`:** run the database SQL first (in
production the app refuses paid requests without it), set up your own SMTP, and
walk the acceptance checklist on a preview deployment.
