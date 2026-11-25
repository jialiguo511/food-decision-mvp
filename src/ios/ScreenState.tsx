"use client";

// Loading / offline / failed states for a bundled screen, in the app's own look.
import Button from "@/components/ui/Button";
import type { AppData } from "./useAppData";

export default function ScreenState({ state, onRetry }: { state: AppData<unknown>; onRetry: () => void }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3 pt-2" role="status" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-3xl bg-line/60" />
        ))}
      </div>
    );
  }
  const offline = state.status === "offline";
  return (
    <section role="alert" className="mt-2 rounded-3xl border border-line bg-card p-5">
      <p className="font-semibold">{offline ? "You're offline." : "Something went wrong loading this."}</p>
      <p className="mt-1 text-sm text-muted">{offline ? "Connect to Wi-Fi or mobile data, then try again." : "It's not something you did. Please try again."}</p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}
