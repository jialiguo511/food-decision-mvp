import Button from "@/components/ui/Button";
import type { Understood } from "../flow/interpret";

/** What was read from the sentence, shown back so it can be corrected: the
 *  words as typed, then each part of the request — solid when the person said
 *  it, dotted when it was filled in from their own earlier answers. Edit opens
 *  the usual question screens with all of it already filled in. */
export default function UnderstoodPanel({ understood, onEdit, readOnly = false }: { understood: Understood; onEdit: () => void; readOnly?: boolean }) {
  const assumed = understood.parts.some((p) => !p.said);
  const chip = "rounded-full px-2.5 py-1 text-xs font-medium";
  return (
    <section aria-label="What I understood" className="mt-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What I understood</p>
        {!readOnly && (
          <Button variant="quiet" onClick={onEdit} className="-mr-3 -mt-2.5 font-semibold">
            Edit
          </Button>
        )}
      </div>
      <p className="line-clamp-2 text-sm italic text-ink/80">“{understood.text}”</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {understood.parts.map((part) => (
          <li
            key={part.text}
            title={part.said ? undefined : "Filled in from your earlier answers"}
            className={`${chip} ${part.said ? "bg-cream text-ink/80 ring-1 ring-line" : "border border-dashed border-line text-muted"}`}
          >
            {part.text}
          </li>
        ))}
        {understood.foods.length > 0 && <li className={`${chip} bg-cream text-ink/80 ring-1 ring-line`}>Have: {understood.foods.join(", ")}</li>}
        {understood.craving && <li className={`${chip} bg-cream text-ink/80 ring-1 ring-line`}>Craving: {understood.craving}</li>}
      </ul>
      {assumed && <p className="mt-2 text-xs text-muted">Dotted ones weren&apos;t in your sentence — they&apos;re from your earlier answers.</p>}
    </section>
  );
}
