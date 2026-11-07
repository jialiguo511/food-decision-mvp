"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { resetMyData, deleteAccount, type AccountResult } from "./account.actions";

type Pending = "reset" | "delete" | null;

/**
 * Account & data — at the very bottom of Me. Two different things, visually
 * separated: Reset keeps the login and returns to a brand-new-user state;
 * Delete removes the account for good (and is the quieter, more cautious one).
 * Each asks once, inline, and can't be submitted twice. After either succeeds
 * the page does a FULL load — dropping the in-memory request store and any
 * cached server render — so nothing stale survives.
 */
export default function AccountDataSection() {
  const [asking, setAsking] = useState<Pending>(null);
  const [busy, setBusy] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirm(kind: Exclude<Pending, null>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    let result: AccountResult;
    try {
      result = await (kind === "reset" ? resetMyData() : deleteAccount());
    } catch {
      result = { ok: false, error: "Something went wrong. Please try again." };
    }
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      inFlight.current = false;
      return;
    }
    // Stays "busy" through the navigation, so a second tap can't slip in.
    if (kind === "delete") {
      await createClient().auth.signOut().catch(() => undefined);
      window.location.assign("/login");
    } else {
      // Still signed in: back to the first-time flow, from a clean load.
      window.location.assign("/today");
    }
  }

  return (
    <section className="mt-10 border-t border-line pt-6" aria-labelledby="account-data">
      <h2 id="account-data" className="text-lg font-semibold tracking-tight">
        Account &amp; data
      </h2>

      <div className="mt-4 space-y-5">
        <div>
          <p className="text-sm font-medium">Reset my data</p>
          <p className="mt-0.5 text-sm text-muted">Start over without deleting your account.</p>
          {asking === "reset" ? (
            <Confirm
              title="Start over?"
              body="This clears your preferences, saved meals, history, and other app data. Your account and email will stay active."
              action="Reset my data"
              busy={busy === "reset"}
              onCancel={() => setAsking(null)}
              onConfirm={() => confirm("reset")}
            />
          ) : (
            <Button variant="secondary" className="mt-3" onClick={() => (setError(null), setAsking("reset"))} disabled={busy !== null}>
              Reset my data
            </Button>
          )}
        </div>

        <div>
          <p className="text-sm font-medium">Delete my account</p>
          <p className="mt-0.5 text-sm text-muted">Permanently removes your account and everything in it.</p>
          {asking === "delete" ? (
            <Confirm
              title="Delete account?"
              body="This permanently deletes your account and app data. This can't be undone."
              action="Delete account"
              destructive
              busy={busy === "delete"}
              onCancel={() => setAsking(null)}
              onConfirm={() => confirm("delete")}
            />
          ) : (
            <Button variant="quiet" className="-ml-3 mt-1 text-red-600" onClick={() => (setError(null), setAsking("delete"))} disabled={busy !== null}>
              Delete my account
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function Confirm({
  title,
  body,
  action,
  destructive = false,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  action: string;
  destructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={title} className="animate-fade-in mt-3 rounded-2xl border border-line bg-card p-4">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">
          Cancel
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${
            destructive ? "bg-red-600" : "bg-accent"
          }`}
        >
          {busy ? "Working…" : action}
        </button>
      </div>
    </div>
  );
}
