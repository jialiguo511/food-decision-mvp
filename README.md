# Food Decision MVP

"What should I actually eat right now?" — three options, chosen for the
constraints you actually have tonight.

## Product documentation

| file | what it covers |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Product thesis, target user, principles, MVP, non-goals |
| [`PLAN.md`](PLAN.md) | Current roadmap — NOW / NEXT / LATER |
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

### 4. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be sent to `/login`.

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
| **`/profile`** | **Built** — set goal, protein, budget, cuisines, dislikes, equipment, fridge, time |

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
