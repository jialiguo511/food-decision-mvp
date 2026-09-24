"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import TagInput from "@/components/ui/TagInput";
import { setPantryItems } from "./actions";

/**
 * The smallest usable pantry: what food the user generally has at home, so
 * Cook never has to ask again. No quantities, categories, or expiry — see
 * CLAUDE.md's current non-goals. Reuses TagInput as-is; each change replaces
 * the whole list server-side via setPantryItems.
 */
export default function PantryCard({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string[]) {
    setItems(next);
    setError(null);
    startTransition(async () => {
      const result = await setPantryItems(next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card
      title="Your pantry"
      hint="Things you generally have at home. Cook uses these automatically — no need to re-enter them each time."
    >
      <TagInput placeholder="Add something you usually have…" values={items} onChange={handleChange} />
      {pending && <p className="mt-2 text-xs text-muted">Saving…</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
