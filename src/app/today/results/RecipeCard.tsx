"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { CookRecommendation } from "@/lib/types";
import RecipeImage from "../RecipeImage";
import { RecipeSaveControl } from "../SaveControl";
import type { Selection } from "../useRecommend";
import ResultCard, { Pills, Reveal } from "./ResultCard";

/** A Cook recommendation. First level, in this order: what it is, why it fits (for the first
 *  card why it wins; for the others what it trades against it), what to buy, and only then the
 *  estimates (time, calories, protein, cost). "View steps" reveals the recipe. */
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
            {open ? "Hide steps" : "View steps"}
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
      <p className="line-clamp-4 text-sm leading-relaxed text-ink/90">{r.reason}</p>
      <div className="mt-3 rounded-2xl bg-cream px-3.5 py-3 ring-1 ring-line">
        {r.ingredients_needed.length > 0 ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">To buy</p>
            <p className="mt-1 text-sm font-medium">{r.ingredients_needed.join(" · ")}</p>
          </>
        ) : (
          <p className="text-sm font-medium">Nothing to buy — uses what you have.</p>
        )}
      </div>
      <div className="mt-3">
        <Pills
          items={[
            `~${r.estimated_minutes} min`,
            `~${r.estimated_calories} cal`,
            `~${r.estimated_protein_g}g protein`,
            r.estimated_extra_cost_usd > 0 ? `~$${r.estimated_extra_cost_usd} to buy` : null,
          ]}
        />
      </div>
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
