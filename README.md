# Food Decision MVP

"What should I actually eat right now?" — three options, chosen for the
constraints you actually have tonight.

## Product documentation

| file | what it covers |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Product thesis, target user, principles, MVP, non-goals |
| [`PLAN.md`](PLAN.md) | Current roadmap — NOW / NEXT / LATER / NOT NOW |
| [`PERSONALIZATION.md`](PERSONALIZATION.md) | How the product remembers and learns — explicit, routine, behavioral memory |
| [`CLAUDE.md`](CLAUDE.md) | Coding and product rules for AI-assisted development |
| [`LEARNINGS.md`](LEARNINGS.md) | Evidence and product learnings |

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
   and hit **Run**. This creates the five tables and the security policies.
   It is safe to re-run: if your database predates a newer column (such as
   `daily_calorie_target_kcal`), running the whole file again adds it.
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
   intentionally includes two Enterprise-tier fields (open-now and price level)
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

- On the free tier the built-in email sender is rate-limited (a few per hour).
  If the email is slow, open Supabase → **Authentication → Users** and use
  "Send magic link", or just add yourself there manually.
- Make sure `http://localhost:3000/**` is listed under
  **Authentication → URL Configuration → Redirect URLs**.

After clicking the link you land on `/today`. Tap **Profile** in the bottom
bar to use the page that's actually built.

---

## What to look at

| URL | State |
|---|---|
| `/login` | Magic-link sign-in |
| **`/today`** | **Built** — time, hunger, effort, craving, ingredients, budget override. `Find my meal` shows the captured context; it does not call an LLM yet |
| `/results` | Placeholder (NOW — the recommendation flow) |
| `/inbox` | Placeholder (NEXT) |
| `/my-food` | Placeholder (NEXT) |
| **`/profile`** | **Built** — set goal, protein, optional daily calories, budget, cuisines, dislikes, equipment, fridge, time |

To confirm the profile actually persists: set some chips, press **Save
profile**, reload the page — the choices come back. Then look at
**Table Editor → profiles** in Supabase and you'll see your row.

---

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # full production build
```

---

## Deploy (when you're ready)

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add
the same environment variables in the Vercel project settings — with
`NEXT_PUBLIC_SITE_URL` set to your real domain. Then add
`https://your-app.vercel.app/**` to Supabase's redirect URL list.
