"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { CookRecommendation } from "@/lib/types";
import RecipeImage from "../RecipeImage";
import { RecipeSaveControl } from "../SaveControl";
import type { Selection } from "../useRecommend";
import ResultCard, { Pills, Reveal } from "./ResultCard";

/** A Cook recommendation. First level is only what decides it — picture,
 *  time, rough calories and protein, what it costs tonight, why it fits.
 *  "View recipe" reveals the rest. Every number is an estimate. */
export default function RecipeCard({
  r,
  index,
  sessionId,
  saved,
  selection,
  onChoose,
  way,
}: {
  r: CookRecommendation;
  index: 0 | 1 | 2;
  sessionId: string;
  saved: boolean;
  selection: Selection;
  onChoose: (index: 0 | 1 | 2) => void;
  /** In a cross-way set: which way of eating this card is ("Make it"). */
  way?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = selection.status === "chosen" && selection.index === index;

  return (
    <ResultCard
      recommendation={r}
      eyebrow={way ?? null}
      index={index}
      selection={selection}
      onChoose={onChoose}
      media={<RecipeImage key={`${sessionId}:${index}`} target={{ session_id: sessionId, index }} size="large" slot={index} />}
      corner={<RecipeSaveControl key={`${sessionId}:${index}`} sessionId={sessionId} index={index} initialSaved={saved} />}
      after={
        <>
          <Button variant={chosen && !open ? "primary" : "secondary"} className="mt-2" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide recipe" : "View recipe"}
          </Button>
          <Reveal open={open}>
            <div className="space-y-4 pt-4 text-sm">
              <p className="text-xs text-muted">
                ~${r.estimated_meal_cost_usd} meal · ~${r.estimated_extra_cost_usd} more to buy
              </p>
              <IngredientList label="You have" items={r.ingredients_on_hand} />
              <IngredientList label="To buy" items={r.ingredients_needed} />
              {r.equipment.length > 0 && <IngredientList label="Equipment" items={r.equipment} />}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Steps</p>
                <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
                  {r.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
              {r.watch && (
                <p className="rounded-2xl bg-cream px-3 py-2 text-xs ring-1 ring-line">
                  <span className="font-semibold">Worth knowing:</span> {r.watch}
                </p>
              )}
            </div>
          </Reveal>
        </>
      }
    >
      <Pills
        items={[
          `~${r.estimated_minutes} min`,
          `~${r.estimated_calories} cal`,
          `~${r.estimated_protein_g}g protein`,
          r.estimated_extra_cost_usd > 0 ? `~$${r.estimated_extra_cost_usd} to buy` : "Nothing to buy",
        ]}
      />
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink/90">{r.reason}</p>
    </ResultCard>
  );
}

function IngredientList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p>{items.length > 0 ? items.join(", ") : "—"}</p>
    </div>
  );
}
