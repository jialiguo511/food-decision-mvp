"use client";

import Button from "@/components/ui/Button";
import type { Recommendation } from "@/lib/types";
import type { Selection } from "../useRecommend";
import { friendlyActionError } from "./errorCopy";

// The recommender's roles (best_match / lowest_effort / alternative) with
// words that fit each kind of decision. "Lowest effort" means "cook the
// laziest thing" for a recipe, but "easiest to get" for everything else.
// Never "healthiest" / "cleanest" / "guilt-free".
const ROLE_LABELS: Record<Recommendation["decision_mode"], Record<Recommendation["role"], string>> = {
  cook: { best_match: "Best match", lowest_effort: "Lowest effort", alternative: "Something different" },
  order: { best_match: "Top pick", lowest_effort: "Easy to order", alternative: "Something different" },
  store_snack: { best_match: "Best fit", lowest_effort: "Most satisfying", alternative: "Lighter option" },
  nearby: { best_match: "Best fit", lowest_effort: "Close & easy", alternative: "Something different" },
};

/** The same roles in one or two words, for the tabs under the carousel. */
const SHORT_LABELS: Record<Recommendation["decision_mode"], Record<Recommendation["role"], string>> = {
  cook: { best_match: "Best match", lowest_effort: "Easiest", alternative: "Different" },
  order: { best_match: "Top pick", lowest_effort: "Easiest", alternative: "Different" },
  store_snack: { best_match: "Best fit", lowest_effort: "Filling", alternative: "Lighter" },
  nearby: { best_match: "Best fit", lowest_effort: "Closest", alternative: "Different" },
};
export const shortRoleLabel = (r: Pick<Recommendation, "decision_mode" | "role">) => SHORT_LABELS[r.decision_mode][r.role];

/** The frame every result card shares: role, title, a corner action (Save),
 *  the body, then the explicit choice. The chosen card says so plainly. */
export default function ResultCard({
  recommendation,
  index,
  selection,
  onChoose,
  eyebrow,
  corner,
  media,
  children,
  after,
}: {
  recommendation: Recommendation;
  index: 0 | 1 | 2;
  selection: Selection;
  onChoose: (index: 0 | 1 | 2) => void;
  /** Small line above the title, e.g. a place's category. */
  eyebrow?: string | null;
  corner?: React.ReactNode;
  media?: React.ReactNode;
  children: React.ReactNode;
  /** Below the choice — details, links, "Not for me". */
  after?: React.ReactNode;
}) {
  const chosen = selection.status === "chosen" && selection.index === index;
  const otherChosen = selection.status === "chosen" && !chosen;
  const choosing = selection.status === "choosing" && selection.index === index;
  const failed = selection.status === "failed" && selection.index === index;

  return (
    <article
      className={`rounded-3xl border p-4 shadow-[0_1px_3px_rgba(42,37,32,0.06)] transition-colors ${
        chosen ? "border-accent bg-accent-soft/40" : "border-line bg-card"
      }`}
    >
      {media}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {ROLE_LABELS[recommendation.decision_mode][recommendation.role]}
          </p>
          {eyebrow && <p className="mt-0.5 truncate text-xs text-muted">{eyebrow}</p>}
          <h3 className="mt-1 text-lg font-semibold leading-snug">{recommendation.title}</h3>
        </div>
        {corner && <div className="-mr-1 -mt-1 shrink-0">{corner}</div>}
      </div>

      {chosen && (
        <p role="status" className="mt-3 rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white animate-fade-in">
          Nice — this is your pick.
        </p>
      )}

      <div className="mt-3">{children}</div>

      {failed && (
        <p className="mt-3 text-xs text-red-600">
          {friendlyActionError(selection.message, "Couldn't save your choice. Please try again.")}
        </p>
      )}
      {!chosen && (
        <Button
          className="mt-4"
          onClick={() => onChoose(index)}
          disabled={otherChosen || selection.status === "choosing"}
        >
          {choosing ? "Saving…" : failed ? "Try again" : "Choose this"}
        </Button>
      )}

      {after}
    </article>
  );
}

/** "~20 min · ~550 cal" as small pills. Every number is an estimate. */
export function Pills({ items }: { items: (string | null | false)[] }) {
  const shown = items.filter((i): i is string => typeof i === "string");
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((item) => (
        <li key={item} className="rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink/80 ring-1 ring-line">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A progressively revealed section ("View recipe", "More"). Animates open
 *  with the grid-rows trick, so height needs no measuring. */
export function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}
