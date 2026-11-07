"use client";

import { useEffect, useRef, useState } from "react";
import { useNearViewport } from "@/components/useNearViewport";
import type { RecipeImageResult } from "@/lib/images";

type ImageState = { status: "waiting" } | { status: "loading" } | { status: "empty" } | { status: "loaded"; result: RecipeImageResult };

/**
 * Cook-only recommendation image. The card's text is already on screen; this
 * asks /api/image for the picture afterwards — never from /api/recommend — by
 * (session, card), so the server reads the recipe itself. The server tries a
 * relevant real photo, then a previously generated image, then generates one
 * (once, cached for everyone). While that runs the card shows a quiet
 * placeholder; the picture fades in over it when it arrives; any failure
 * leaves the same clean no-photo band. The card is fully usable throughout.
 */
export type RecipeImageTarget =
  /** A card of one of the user's recommendation sessions. */
  | { session_id: string; index: number }
  /** A row of the user's Saved recipes. */
  | { saved_id: string };

export default function RecipeImage({
  target,
  size,
}: {
  /** What to draw — the server reads the recipe itself from the user's own rows. */
  target: RecipeImageTarget;
  /** best_match gets the larger image; the other two roles get a compact one. */
  size: "large" | "thumbnail";
}) {
  const [state, setState] = useState<ImageState>({ status: "waiting" });
  const box = useRef<HTMLDivElement>(null);
  const near = useNearViewport(box);
  const key = "saved_id" in target ? `saved:${target.saved_id}` : `${target.session_id}:${target.index}`;

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    setState({ status: "loading" });

    fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ({ url: string | null } & Record<string, unknown>) | null) => {
        if (cancelled) return;
        const result = toResult(data);
        setState(result ? { status: "loaded", result } : { status: "empty" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "empty" });
      });

    return () => {
      cancelled = true;
    };
    // The target's parts, not the object: a new object each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, key]);

  // The no-photo state is deliberate, not a broken image: a short, quiet band
  // with a plate icon — constant height from card to card, never pretending to
  // be a photo of this dish. While the picture is on its way a photo-shaped
  // placeholder holds the space so nothing jumps when it arrives.
  const photoBox = `w-full overflow-hidden rounded-xl bg-accent-soft/40 ${size === "large" ? "aspect-video" : "aspect-[4/3] max-w-[140px]"}`;

  if (state.status === "waiting" || state.status === "loading") {
    return <div ref={box} className={`${photoBox} mb-3 ${state.status === "loading" ? "animate-pulse" : ""}`} aria-hidden="true" />;
  }

  if (state.status === "empty") {
    return (
      <div className="mb-3 flex h-14 w-full items-center gap-3 rounded-xl bg-accent-soft/40 px-4 text-accent/70" aria-hidden="true">
        <PlateIcon />
        <span className="text-xs">No photo for this one</span>
      </div>
    );
  }

  const { result } = state;
  return (
    <figure className="mb-3">
      <div className={photoBox}>
        <FadeInImage src={result.url} />
      </div>
      <figcaption className="mt-1 text-[11px] text-muted">
        {result.source === "generated" ? (
          "Illustration generated for this recipe"
        ) : (
          <>
            Photo by{" "}
            <a href={result.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {result.photographerName}
            </a>{" "}
            on{" "}
            <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Pexels
            </a>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** Fades in once the bytes have arrived, over the placeholder behind it. */
function FadeInImage({ src }: { src: string }) {
  const [shown, setShown] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unconfigured host; kept simple for MVP
    <img src={src} alt="" onLoad={() => setShown(true)} className={`h-full w-full object-cover transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`} />
  );
}

/** The route's response → a result, or null for "no image" in any form. */
export function toResult(data: ({ url: string | null } & Record<string, unknown>) | null): RecipeImageResult | null {
  if (!data?.url || typeof data.url !== "string") return null;
  if (data.source === "generated") return { source: "generated", url: data.url };
  if (typeof data.photographerName === "string" && typeof data.photographerUrl === "string" && typeof data.sourceUrl === "string") {
    return { source: "photo", url: data.url, photographerName: data.photographerName, photographerUrl: data.photographerUrl, sourceUrl: data.sourceUrl };
  }
  return null;
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}
