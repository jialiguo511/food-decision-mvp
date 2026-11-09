"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { OrderRecommendation, StoreSnackRecommendation } from "@/lib/types";
import RecipeImage from "../RecipeImage";
import type { Selection } from "../useRecommend";
import ResultCard, { Pills, Reveal } from "./ResultCard";

/** A food idea by type (Delivery / "ideas by type") or a snack to grab: what
 *  it is, rough numbers, why, and the one line needed to act on it — what to
 *  search for, or what to look for. The rest is under "More". */
export default function IdeaCard({
  r,
  index,
  sessionId,
  selection,
  onChoose,
  way,
}: {
  r: OrderRecommendation | StoreSnackRecommendation;
  index: 0 | 1 | 2;
  sessionId: string;
  selection: Selection;
  onChoose: (index: 0 | 1 | 2) => void;
  /** In a cross-way set: which way of eating this card is ("Order it"). */
  way?: string;
}) {
  const [open, setOpen] = useState(false);
  const details =
    r.decision_mode === "order"
      ? [
          ["Look for", r.order_notes],
          ["Customize", r.modification],
          ["Worth knowing", r.watch],
        ]
      : [
          ["If you can't find that", r.backup],
          ["Worth knowing", r.watch],
        ];
  const shown = details.filter((d): d is [string, string] => !!d[1]);

  return (
    <ResultCard
      recommendation={r}
      eyebrow={way ?? null}
      index={index}
      selection={selection}
      onChoose={onChoose}
      // An illustrative real photo of this kind of food (labelled as such), loaded after the text
      // like a recipe's; a quiet placeholder of the same size when no matching photo exists.
      media={<RecipeImage key={`${sessionId}:${index}`} target={{ session_id: sessionId, index }} size="large" slot={index} />}
      after={
        shown.length > 0 && (
          <>
            <Button variant="quiet" className="mt-1 w-full" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Less" : "More"}
            </Button>
            <Reveal open={open}>
              <dl className="space-y-3 pt-2 text-sm">
                {shown.map(([label, text]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                    <dd className="mt-0.5">{text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </>
        )
      }
    >
      <Pills items={[`~${r.estimated_calories} cal`, `~${r.estimated_protein_g}g protein`]} />
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink/90">{r.reason}</p>
      <div className="mt-3 rounded-2xl bg-cream px-3.5 py-3 ring-1 ring-line">
        {r.decision_mode === "order" ? (
          <>
            {/* Broad terms for whatever app the user already has — not a
                promise any of them returns a result; there's no menu data. */}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Try searching</p>
            <p className="mt-1 text-sm font-medium">{r.search_terms.join(" · ")}</p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Look for</p>
            <p className="mt-1 text-sm">{r.what_to_look_for}</p>
          </>
        )}
      </div>
    </ResultCard>
  );
}
