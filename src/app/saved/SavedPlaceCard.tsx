import { buttonClass } from "@/components/ui/Button";
import type { SavedPlace } from "@/lib/saved/saved";
import RemoveSaved from "./RemoveSaved";

const LINK = buttonClass("secondary", "min-h-11 flex-1 text-accent");

/** A saved place, from what was stored when it was saved. Optional fields that
 *  are missing just aren't shown. `showGuidance` is false when the stored
 *  "what to look for" now names one of the user's current allergens — it is
 *  withheld, the place stays. Nothing here says a place or dish is allergy-safe. */
export default function SavedPlaceCard({ place, showGuidance }: { place: SavedPlace; showGuidance: boolean }) {
  const meta = [place.category, place.address].filter((p): p is string => !!p);
  return (
    <article className="rounded-3xl border border-line bg-card p-4 shadow-[0_1px_3px_rgba(42,37,32,0.06)]">
      <h3 className="text-lg font-semibold leading-snug">{place.name}</h3>
      {meta.length > 0 && <p className="mt-1 text-sm text-muted">{meta.join(" · ")}</p>}

      {place.look_for &&
        (showGuidance ? (
          <div className="mt-3 rounded-2xl bg-accent-soft/60 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">What to look for · guidance, not a menu item</p>
            <p className="mt-1 text-sm leading-relaxed">{place.look_for}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Food suggestion hidden — it may no longer fit your allergies.</p>
        ))}

      {(place.maps_url || place.website_url) && (
        <div className="mt-3 flex gap-2">
          {place.maps_url && (
            <a href={place.maps_url} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open in Maps ↗
            </a>
          )}
          {place.website_url && (
            <a href={place.website_url} target="_blank" rel="noopener noreferrer" className={LINK}>
              Website ↗
            </a>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span>{place.saved_at ? `Saved ${new Date(place.saved_at).toLocaleDateString()}` : "Saved"}</span>
        <RemoveSaved kind="place" id={place.place_id} />
      </div>
    </article>
  );
}
