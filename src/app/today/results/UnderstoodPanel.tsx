"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { Understood } from "../flow/interpret";

type Field = NonNullable<Understood["parts"][number]["field"]>;

/** What was read from the sentence, shown back so it can be corrected: the
 *  words as typed, then each part of the request — solid when the person said
 *  it, dotted when it was filled in from their own earlier answers.
 *
 *  Two different edits live here, and neither is "Change" (which goes back to the
 *  sentence): tapping ONE chip opens just that question; "Edit details" opens the
 *  questions from the first, everything already filled in. */
export default function UnderstoodPanel({
  understood,
  onEdit,
  onEditField,
  readOnly = false,
  hint,
  defaultOpen = false,
}: {
  understood: Understood;
  /** Open the questions from the first one. */
  onEdit: () => void;
  /** Open just the question behind one chip. */
  onEditField?: (field: Field) => void;
  readOnly?: boolean;
  /** A line under the chips, e.g. how to change a read-only request. */
  hint?: string;
  /** Start expanded (the public example shows the reading as part of its story). */
  defaultOpen?: boolean;
}) {
  const assumed = understood.parts.some((p) => !p.said);
  const chip = "rounded-full px-2.5 py-1 text-xs font-medium";
  const solid = "bg-cream text-ink/80 ring-1 ring-line";
  const dotted = "border border-dashed border-line text-muted";
  const editable = !readOnly && !!onEditField;

  /** A chip: a button that opens its question when editing is available, plain text otherwise. */
  const renderChip = ({ text, className, field, title }: { text: string; className: string; field?: Field; title?: string }) =>
    editable && field ? (
      <button type="button" onClick={() => onEditField(field)} title={title} aria-label={`Edit: ${text}`} className={`${chip} ${className} min-h-8 transition-colors hover:border-accent/60 hover:text-ink`}>
        {text}
      </button>
    ) : (
      <span title={title} className={`${chip} ${className}`}>
        {text}
      </span>
    );

  // Collapsed by default: one line that says what it is and how many things were read, with an
  // obvious way to open it. Everything else (the words as typed, each chip, edit) is one tap away.
  const [open, setOpen] = useState(defaultOpen);
  const count = understood.parts.length + (understood.foods.length > 0 ? 1 : 0) + (understood.craving ? 1 : 0);
  if (!open) {
    return (
      <section aria-label="What I understood" className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 text-left text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold">What I understood</span>
            <span className="text-muted"> · {count} {count === 1 ? "item" : "items"}{assumed ? ", some filled in" : ""}</span>
          </span>
          <span className="shrink-0 font-semibold text-accent">View / edit</span>
        </button>
      </section>
    );
  }

  return (
    <section aria-label="What I understood" className="mt-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setOpen(false)} aria-expanded className="min-h-8 text-xs font-semibold uppercase tracking-wide text-muted">
          What I understood ▴
        </button>
        {!readOnly && (
          <Button variant="quiet" onClick={onEdit} className="-mr-3 -mt-2.5 font-semibold">
            Edit details
          </Button>
        )}
      </div>
      <p className="line-clamp-2 text-sm italic text-ink/80">
        {understood.adjusted ? "You asked to change it: " : ""}“{understood.text}”
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {understood.parts.map((part) => (
          <li key={part.text}>
            {renderChip({ text: part.text, field: part.field, className: part.said ? solid : dotted, title: part.said ? undefined : "Not in your sentence" })}
          </li>
        ))}
        {understood.foods.length > 0 && (
          <li>
            {renderChip({ text: `Have: ${understood.foods.join(", ")}`, field: "foods", className: solid })}
          </li>
        )}
        {understood.craving && (
          <li>
            {renderChip({ text: `Craving: ${understood.craving}`, field: "craving", className: solid })}
          </li>
        )}
      </ul>
      {assumed && <p className="mt-2 text-xs text-muted">Dotted ones weren&apos;t in your sentence — we filled them in.</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {editable && <p className="mt-1 text-xs text-muted">Tap an item to change just that, or use Adjust (top right) to say what should be different.</p>}
    </section>
  );
}
