/** Shown when .env.local has not been filled in yet, so `npm run dev` gives
 *  instructions instead of a stack trace. */
export default function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
      <p className="mt-2 text-sm text-muted">
        The app is running, but it has no Supabase project to talk to yet.
      </p>
      <ol className="mt-6 space-y-3 text-sm">
        <li>
          1. Create a free project at{" "}
          <span className="font-medium">supabase.com</span>.
        </li>
        <li>
          2. Run{" "}
          <code className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">
            supabase/schema.sql
          </code>{" "}
          in its SQL editor.
        </li>
        <li>
          3. Copy{" "}
          <code className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">
            .env.local.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">
            .env.local
          </code>{" "}
          and paste in your project URL and anon key.
        </li>
        <li>4. Restart the dev server.</li>
      </ol>
    </div>
  );
}
