"use client";

import { useEffect, useRef, useState } from "react";
import { IS_BUNDLED_APP } from "@/ios/config";
import MediaFrame, { FramePlaceholder } from "./MediaFrame";
import { useMediaWanted } from "./useMediaWanted";

/**
 * A restaurant card's picture: the real Google photo of this place, loaded
 * (lazily, through /api/place-photo) only when the card is about to be seen —
 * never a generated image. No photo reference means no request and a short
 * neutral band. A photo that fails to load keeps its frame (same size, same
 * caption line) and shows the neutral placeholder inside it, so the card
 * doesn't change height under the user's thumb. Cards without a photo
 * reference make no request.
 */
export default function PlacePhoto({ sessionId, index, hasPhoto, author }: { sessionId: string; index: number; hasPhoto: boolean; author: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const wanted = useMediaWanted(box, index);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const src = useAuthedImage(wanted && hasPhoto ? `/api/place-photo?session_id=${encodeURIComponent(sessionId)}&index=${index}` : null, () => setState("failed"));

  if (!hasPhoto) return <Band />;
  return (
    <MediaFrame
      size="large"
      state={state === "loaded" ? "ready" : state === "failed" ? "failed" : wanted ? "loading" : "waiting"}
      cause={state === "failed" ? "display" : undefined}
      frameRef={box}
      caption={state === "loaded" ? `Photo from Google Maps${author ? ` · ${author}` : ""}` : undefined}
    >
      {state === "failed" ? (
        <FramePlaceholder size="large" text="No photo for this place" />
      ) : (
        src && (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy of a provider image
          <img
            src={src}
            alt=""
            onLoad={() => setState("loaded")}
            onError={() => setState("failed")}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          />
        )
      )}
    </MediaFrame>
  );
}

/** The photo address to show. On the web the browser's cookie authorises the proxy, so it is the path
 *  itself. In the bundled iOS app an <img> can't carry the sign-in token, so the photo is fetched (the
 *  fetch bridge adds the token) and shown from a local object URL, released when the card goes. */
function useAuthedImage(path: string | null, onFail: () => void): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!IS_BUNDLED_APP || !path) return;
    let live = true;
    let made: string | null = null;
    void fetch(path)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setObjectUrl(made);
      })
      .catch(() => live && onFail());
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
    // onFail is a fresh closure each render; the request depends on the path only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return IS_BUNDLED_APP ? objectUrl : path;
}

function Band() {
  return (
    <div className="mb-3 flex h-14 w-full items-center gap-3 rounded-xl bg-accent-soft/40 px-4 text-accent/70" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11M17 3v7" />
      </svg>
      <span className="text-xs">No photo for this place</span>
    </div>
  );
}
