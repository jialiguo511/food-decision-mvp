"use client";

import { useRef, useState } from "react";
import { useNearViewport } from "@/components/useNearViewport";

/**
 * A restaurant card's picture: the real Google photo of this place, loaded
 * (lazily, through /api/place-photo) only when the card is about to be seen —
 * never a generated image. No photo, or one that fails to load, is a neutral
 * restaurant placeholder: constant height from card to card, never pretending to
 * be a photo of the food. Cards without a photo reference make no request.
 */
export default function PlacePhoto({ sessionId, index, hasPhoto, author }: { sessionId: string; index: number; hasPhoto: boolean; author: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const near = useNearViewport(box);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");

  if (!hasPhoto || state === "failed") return <Placeholder />;
  return (
    <figure className="mb-3">
      <div ref={box} className="aspect-video w-full overflow-hidden rounded-xl bg-accent-soft/40">
        {near && (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy of a provider image
          <img
            src={`/api/place-photo?session_id=${encodeURIComponent(sessionId)}&index=${index}`}
            alt=""
            onLoad={() => setState("loaded")}
            onError={() => setState("failed")}
            className={`h-full w-full object-cover transition-opacity duration-500 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </div>
      <figcaption className="mt-1 text-[11px] text-muted">Photo from Google Maps{author ? ` · ${author}` : ""}</figcaption>
    </figure>
  );
}

function Placeholder() {
  return (
    <div className="mb-3 flex h-14 w-full items-center gap-3 rounded-xl bg-accent-soft/40 px-4 text-accent/70" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11M17 3v7" />
      </svg>
      <span className="text-xs">No photo for this place</span>
    </div>
  );
}
