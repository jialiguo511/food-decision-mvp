import { formatDistance } from "@/lib/places/distance";
import type { NearbyRecommendation, PlacePriceLevel } from "@/lib/types";

const PRICE_LABELS: Record<PlacePriceLevel, string> = {
  free: "Free",
  inexpensive: "$",
  moderate: "$$",
  expensive: "$$$",
  very_expensive: "$$$$",
};

/** The body of a nearby-place card, below its title: where it is, why it fits
 *  right now, what kind of food to look for, and a link to the real place.
 *  Every fact in the meta line is shown only when the provider gave it — an
 *  unknown price or open status is simply left out, never guessed. Distance is
 *  straight-line and labeled approximate; there is no walking time. */
export default function NearbyPlaceDetails({ r }: { r: NearbyRecommendation }) {
  const meta = [
    r.distance_m !== null ? formatDistance(r.distance_m) : null,
    r.category,
    r.price_level ? PRICE_LABELS[r.price_level] : null,
    // Places known to be closed are filtered out before ranking, and a
    // restored session may be hours old, so this says when it was true.
    r.open_now ? "Open when checked" : null,
  ].filter((part): part is string => part !== null);

  return (
    <>
      {meta.length > 0 && <p className="mt-1 text-xs text-muted">{meta.join(" · ")}</p>}
      {r.address && <p className="text-xs text-muted">{r.address}</p>}
      <p className="mt-2 text-sm">{r.reason}</p>
      <p className="mt-3 text-xs">
        <span className="text-muted">Look for:</span> {r.look_for}
      </p>
      <a
        href={r.maps_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-accent"
      >
        Open in Maps ↗
      </a>
    </>
  );
}
