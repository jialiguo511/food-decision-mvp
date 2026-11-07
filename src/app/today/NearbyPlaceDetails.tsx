import { buttonClass } from "@/components/ui/Button";
import { formatDistance } from "@/lib/places/distance";
import type { NearbyRecommendation, PlacePriceLevel } from "@/lib/types";
import PlaceCardActions from "./PlaceCardActions";
import type { PlaceFeedbackState } from "./PlaceFeedback";

const PRICE_LABELS: Record<PlacePriceLevel, string> = {
  free: "Free",
  inexpensive: "$",
  moderate: "$$",
  expensive: "$$$",
  very_expensive: "$$$$",
};

/** The body of a nearby-place card, below its name: how far, whether it was
 *  open, price; what to look for there; why it fits; links to the real place;
 *  Save and "Not for me".
 *  Every fact is shown only when the provider gave it — an unknown price,
 *  open status, or website is left out, never guessed. Distance is
 *  straight-line and approximate. "What to look for" is guidance — the
 *  provider has no menu — and is labeled as such on the card itself. */
export default function NearbyPlaceDetails({
  r,
  sessionId,
  index,
  feedback = null,
  saved = false,
  chosen = false,
}: {
  r: NearbyRecommendation;
  sessionId: string;
  /** Which of the session's cards this is (what Save stores from). */
  index: number;
  /** This user's saved "not for me" answer for the place, when restoring. */
  feedback?: PlaceFeedbackState | null;
  /** Whether this place is already in the user's Saved. */
  saved?: boolean;
  /** Once picked, Maps becomes the next step, so it gets the main button. */
  chosen?: boolean;
}) {
  const meta = [
    r.distance_m !== null ? formatDistance(r.distance_m) : null,
    // Places known to be closed are filtered out before ranking, and a
    // restored session may be hours old, so this says when it was true.
    r.open_now ? "Open when checked" : null,
    r.price_level ? PRICE_LABELS[r.price_level] : null,
  ].filter((part): part is string => part !== null);

  return (
    <>
      {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
      {r.look_for ? (
        <div className="mt-3 rounded-2xl bg-accent-soft/60 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            What to look for · guidance, not a menu item
          </p>
          <p className="mt-1 text-sm leading-relaxed">{r.look_for}</p>
        </div>
      ) : r.enriched === false ? (
        // The places are already here; the model is still writing what to look
        // for. A quiet line, not a "no suggestion" claim.
        <p role="status" className="mt-3 animate-pulse text-xs text-muted">
          Finding what to order…
        </p>
      ) : (
        // Withheld server-side (it named one of the user's allergens). Says
        // nothing more: no food suggestion beats a wrong one.
        <p className="mt-3 text-xs text-muted">No food suggestion for this place.</p>
      )}
      <p className="mt-3 line-clamp-2 text-sm text-ink/90">{r.reason}</p>
      <div className={`mt-3 flex gap-2 ${chosen ? "flex-col" : ""}`}>
        <a
          href={r.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className={chosen ? buttonClass("primary") : buttonClass("secondary", "min-h-11 flex-1 whitespace-nowrap text-accent")}
        >
          {chosen ? "Open in Maps ↗" : "Maps ↗"}
        </a>
        {r.website_url && (
          <a
            href={r.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary", `min-h-11 whitespace-nowrap text-accent ${chosen ? "" : "flex-1"}`)}
          >
            Website ↗
          </a>
        )}
      </div>
      <PlaceCardActions
        key={`${sessionId}:${r.place_id}`}
        placeId={r.place_id}
        sessionId={sessionId}
        index={index}
        initialFeedback={feedback}
        initialSaved={saved}
      />
    </>
  );
}
