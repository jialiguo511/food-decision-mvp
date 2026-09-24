"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import type { GrocerySuggestion } from "@/lib/groceryHelper";
import type { RecommendFailure } from "@/lib/types";
import { addPantryItems } from "./actions";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: GrocerySuggestion[] }
  | { status: "added" };

/**
 * "Help me shop" — the Groceries tab's one feature. Suggests 3-5 items that
 * make the existing pantry more useful across several meals (not a recipe,
 * not a meal plan — see lib/groceryHelper.ts), lets the user tap to select
 * some, and adds the selected ones straight to the pantry.
 */
export default function GroceryHelperCard() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function helpMeShop() {
    setState({ status: "loading" });
    setSelected(new Set());
    startTransition(async () => {
      try {
        const response = await fetch("/api/grocery-suggestions", { method: "POST" });
        const body = await response.json();
        if (!response.ok) {
          const failure = body as RecommendFailure;
          setState({ status: "error", message: failure.error?.message ?? "Something went wrong." });
          return;
        }
        setState({ status: "ready", suggestions: body.suggestions as GrocerySuggestion[] });
      } catch {
        setState({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addSelected() {
    const names = Array.from(selected);
    if (names.length === 0) return;
    startTransition(async () => {
      const result = await addPantryItems(names);
      if (result.ok) setState({ status: "added" });
      else setState({ status: "error", message: result.error });
    });
  }

  return (
    <Card title="Going shopping?" hint="Add a few things that will make your pantry more useful.">
      {state.status === "idle" && (
        <HelpMeShopButton onClick={helpMeShop} pending={pending} />
      )}

      {state.status === "loading" && <p className="text-sm text-muted">Thinking about what would help…</p>}

      {state.status === "error" && (
        <div>
          <p className="text-sm text-red-600">{state.message}</p>
          <div className="mt-3">
            <HelpMeShopButton onClick={helpMeShop} pending={pending} label="Try again" />
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div>
          <div className="flex flex-col gap-2">
            {state.suggestions.map((item) => (
              <Chip
                key={item.name}
                label={item.name}
                hint={item.reason}
                selected={selected.has(item.name)}
                onClick={() => toggle(item.name)}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={addSelected}
              disabled={selected.size === 0 || pending}
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add selected to pantry
            </button>
            <button
              type="button"
              onClick={helpMeShop}
              disabled={pending}
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-muted disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {state.status === "added" && (
        <div>
          <p className="text-sm text-ink">Added to your pantry.</p>
          <div className="mt-3">
            <HelpMeShopButton onClick={helpMeShop} pending={pending} label="Help me shop again" />
          </div>
        </div>
      )}
    </Card>
  );
}

function HelpMeShopButton({
  onClick,
  pending,
  label = "Help me shop",
}: {
  onClick: () => void;
  pending: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
    >
      {label}
    </button>
  );
}
