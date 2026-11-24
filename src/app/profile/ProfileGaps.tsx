import type { ProfileGap } from "@/lib/profileCompletion";

/** One quiet card at the top of Me: what's not set yet and what each would change. Optional;
 *  it disappears once nothing is left. Never shown on Home's decision path. */
export default function ProfileGaps({ gaps }: { gaps: ProfileGap[] }) {
  if (gaps.length === 0) return null;
  return (
    <section aria-label="Optional details" className="mb-6 rounded-3xl border border-sage/30 bg-sage-soft p-4">
      <p className="text-sm font-semibold text-ink">Help suggestions fit you better</p>
      <p className="mt-0.5 text-xs text-muted">All optional — skip any of it.</p>
      <ul className="mt-3 space-y-1">
        {gaps.slice(0, 3).map((g) => (
          <li key={g.key}>
            <a href={g.href} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-1 text-sm">
              <span>
                <span className="font-semibold">{g.label}</span> <span className="text-muted">— {g.why}</span>
              </span>
              <span aria-hidden className="text-sage">›</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
