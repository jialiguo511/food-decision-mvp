# Security

## Reporting a vulnerability

Please report security problems privately by email to **jialidaisy@gmail.com** (subject: "Security: What Should I Eat"), or through GitHub's *Report a vulnerability* button on this repository's Security tab if it is enabled. Please do not open a public issue for a vulnerability.

This is a personal project in public beta, run by one person. I will acknowledge a report as soon as I can and aim to fix confirmed issues promptly, but I can't promise a fixed response time. Please don't access other people's data, run load or denial-of-service tests against the live site, or send spam through the sign-in form while testing.

## Security model in brief

- **Secrets are server-only.** The model, Places and service-role keys never have a `NEXT_PUBLIC_` prefix and are not committed. The browser holds only Supabase's public (anon) key, which is public by design.
- **Row Level Security is the authorization layer.** Every user-owned table is restricted to its own rows, with explicit grants. Two-account isolation is tested against a real Postgres engine (`src/test/isolation.realdb.test.ts`).
- **Paid calls are metered before they run**, per person and app-wide, by a Postgres function only the server role can execute, with an off switch. Paid routes require a signed-in session and refuse cross-site requests.
- **Sign-in** is a one-time email link, with an optional Cloudflare Turnstile check enforced by Supabase. The callback only follows same-site paths.
- **Logs and product events** carry codes and timings, never what a person typed, foods, health details or location.

## Known limits

- Allergen and dietary checks on recommendations are literal word matches, not a safety guarantee. This is stated in the app.
- No Content-Security-Policy `script-src` yet (needs nonces); a partial CSP and the other standard headers are set.
- The project has not had an external security review.
