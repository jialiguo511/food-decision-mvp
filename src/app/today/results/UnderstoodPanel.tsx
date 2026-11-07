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
}: {
  understood: Understood;
  /** Open the questions from the first one. */
  onEdit: () => void;
  /** Open just the question behind one chip. */
  onEditField?: (field: Field) => void;
  readOnly?: boolean;
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

  return (
    <section aria-label="What I understood" className="mt-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What I understood</p>
        {!readOnly && (
          <Button variant="quiet" onClick={onEdit} className="-mr-3 -mt-2.5 font-semibold">
            Edit details
          </Button>
        )}
      </div>
      <p className="line-clamp-2 text-sm italic text-ink/80">“{understood.text}”</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {understood.parts.map((part) => (
          <li key={part.text}>
            {renderChip({ text: part.text, field: part.field, className: part.said ? solid : dotted, title: part.said ? undefined : "Filled in from your earlier answers" })}
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
      {assumed && <p className="mt-2 text-xs text-muted">Dotted ones weren&apos;t in your sentence — they&apos;re from your earlier answers.</p>}
      {editable && <p className="mt-1 text-xs text-muted">Tap an item to change just that, or use Change (top right) to reword your sentence.</p>}
    </section>
  );
}
