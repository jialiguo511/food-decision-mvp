"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import TagInput from "@/components/ui/TagInput";
import { setKitchenStaples } from "./actions";

/**
 * Persistent condiments and seasonings only — salt, oil, soy sauce, spices —
 * things that survive across meals. Never actual food: no chicken, tofu,
 * eggs, produce. Today's "What do you have right now?" is the only place to
 * say what's actually available for tonight, and it is never saved here or
 * anywhere else — see CLAUDE.md's canonical availability rule. Reuses
 * TagInput as-is; each change replaces the whole list server-side via
 * setKitchenStaples.
 */
export default function KitchenStaplesCard({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string[]) {
    setItems(next);
    setError(null);
    startTransition(async () => {
      const result = await setKitchenStaples(next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card
      title="Kitchen staples"
      hint="Things you usually keep around — salt, oil, soy sauce, spices. Not food itself; add what you actually have on Today."
    >
      <TagInput placeholder="Add a staple you usually have…" values={items} onChange={handleChange} />
      {pending && <p className="mt-2 text-xs text-muted">Saving…</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
