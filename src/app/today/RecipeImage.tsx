"use client";

import { useEffect, useRef, useState } from "react";
import { forgetImage, imageKey, peekImage, requestImage, retriesLeft, toResult, type ImageOutcome, type RecipeImageTarget } from "./imageStore";
import MediaFrame, { FramePlaceholder } from "./results/MediaFrame";
import { useMediaWanted } from "./results/useMediaWanted";

export type { RecipeImageTarget };
export { toResult };

/**
 * A recommendation card's picture — a recipe's, or (for "Order it" / "Grab it") an
 * illustrative photo of the kind of food. Never used for a real place. The card's text is already on screen; this
 * asks /api/image for the picture afterwards — never from /api/recommend — by
 * (session, card), so the server reads the recipe itself. The server tries a
 * relevant real photo, then a previously generated image, then generates one
 * (once, cached for everyone).
 *
 * The request itself lives in imageStore (not in this component), so a remount
 * reuses the answer or the request already running. The frame never changes
 * size between states (waiting / loading / ready / none / failed). "Failed"
 * offers Try again; "none" is a settled answer and doesn't. The card is fully
 * usable throughout.
 */
export default function RecipeImage({
  target,
  size,
  slot,
}: {
  /** What to draw — the server reads the recipe itself from the user's own rows. */
  target: RecipeImageTarget;
  /** best_match gets the larger image; the other two roles get a compact one. */
  size: "large" | "thumbnail";
  /** Position in a carousel, so the card can load when it is next to the active one. */
  slot?: number;
}) {
  const key = imageKey(target);
  const box = useRef<HTMLDivElement>(null);
  const wanted = useMediaWanted(box, slot);
  const [outcome, setOutcome] = useState<ImageOutcome | undefined>(() => peekImage(key));
  const [loading, setLoading] = useState(false);
  /** The picture arrived but the browser couldn't display it. */
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wanted) return;
    const known = peekImage(key);
    if (known) {
      setOutcome(known);
      return;
    }
    let cancelled = false;
    setLoading(true);
    requestImage(target).then((next) => {
      if (cancelled) return;
      setOutcome(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // The target's parts, not the object: a new object each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, key, attempt]);

  function retry() {
    // A picture that wouldn't display is not a settled answer: ask again.
    if (broken) forgetImage(key);
    setBroken(false);
    setOutcome(undefined);
    setAttempt((n) => n + 1);
  }

  const canRetry = retriesLeft(key) > 0;
  const tryAgain = canRetry ? (
    <button type="button" onClick={retry} className="min-h-8 rounded-full px-3 text-xs font-semibold text-accent underline-offset-2 hover:underline">
      Try again
    </button>
  ) : null;

  if (outcome?.status === "ready" && !broken) {
    const { result } = outcome;
    return (
      <MediaFrame
        size={size}
        state="ready"
        cause={result.source}
        frameRef={box}
        caption={
          result.source === "generated" ? (
            "Illustration generated for this recipe"
          ) : (
            <>
              <span className="font-medium">Illustrative photo</span> · Photo by{" "}
              <a href={result.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {result.photographerName}
              </a>{" "}
              on{" "}
              <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Pexels
              </a>
            </>
          )
        }
      >
        <FadeInImage key={attempt} src={result.url} onBroken={() => setBroken(true)} />
      </MediaFrame>
    );
  }
  if (broken) {
    return (
      <MediaFrame size={size} state="failed" cause="display" frameRef={box}>
        <FramePlaceholder size={size} text="The picture didn't display" action={tryAgain} />
      </MediaFrame>
    );
  }
  if (outcome?.status === "failed") {
    return (
      <MediaFrame size={size} state="failed" cause={outcome.cause} frameRef={box}>
        <FramePlaceholder size={size} text={outcome.cause === "generation" ? "Couldn't make a picture" : "Couldn't load the picture"} action={tryAgain} />
      </MediaFrame>
    );
  }
  if (outcome?.status === "none") {
    return (
      <MediaFrame size={size} state="none" cause={outcome.reason} frameRef={box}>
        <FramePlaceholder size={size} text={outcome.reason === "limited" ? "Picture limit reached for today" : "No photo for this one"} />
      </MediaFrame>
    );
  }
  return <MediaFrame size={size} state={loading ? "loading" : "waiting"} frameRef={box} />;
}

/** Fades in once the bytes have arrived, over the frame behind it. */
function FadeInImage({ src, onBroken }: { src: string; onBroken: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unconfigured host; kept simple for MVP
    <img src={src} alt="" onLoad={() => setShown(true)} onError={onBroken} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`} />
  );
}
