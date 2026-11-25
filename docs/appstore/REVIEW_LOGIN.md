# App Review sign-in — proposal (not built; needs your go)

**Problem.** The app signs in with an emailed one-time code. Apple reviewers can't read your inbox,
and a shared Gmail login fails in review (new-device checks, 2-step verification).

## Recommended: a review account with a fixed review code
- One dedicated account, e.g. `appreview@<a domain you control>` (any address you'll never need to
  read; it never receives mail).
- Two server-only settings on Vercel: `REVIEW_ACCOUNT_EMAIL` and `REVIEW_ACCOUNT_CODE` (a long random
  code, e.g. 12 digits). **Off when either is unset.**
- On the sign-in screen, when the email typed is exactly that address, "Email me a sign-in code"
  sends nothing; the person types the review code. The server compares it in constant time, then uses
  Supabase's admin API (`generateLink`, no email sent) to mint a one-time token for **that one
  account only**; the app finishes with the normal `verifyOtp`, so the session is an ordinary one.
- Guards: only that exact email; at most 5 tries per 10 minutes; code never logged; the account has
  normal limits and no special permissions; rotate or remove the code after review.
- App Store Connect → App Review Information → Sign-in required: user name = the review email,
  password = the review code, plus a note: "Type this email, tap *Email me a sign-in code*, then enter
  the password as the code."
- Size: one small route + a branch in the sign-in page + tests. About half a day.

## Alternative: Sign in with Apple
Reviewers can use their own Apple ID. Already built and switched off; needs your membership,
the Supabase Apple provider and `NEXT_PUBLIC_APPLE_SIGNIN=on`. Downside: Apple still usually asks for
a demo account when sign-in is required, and it adds the duplicate-account path to review.

## Not recommended
- A shared Gmail inbox for reviewers (blocked by Google's new-device checks; a password to share).
- Turning off the email code or CAPTCHA during review (weakens the live app).
