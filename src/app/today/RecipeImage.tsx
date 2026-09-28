"use client";

import { useEffect, useState } from "react";
import type { ImageResult } from "@/lib/images";

type ImageState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; result: ImageResult };

/**
 * Cook-only recommendation image, fetched from /api/image on mount — never
 * from /api/recommend, which stays independent of image lookup. Renders a
 * fixed-size skeleton while loading and the same clean fallback on "no
 * image" or any fetch failure, so the card is fully usable either way.
 */
export default function RecipeImage({
  query,
  size,
}: {
  /** A Cook recommendation's image_query. Null on sessions saved before the
   *  field existed — treated the same as "no image found". */
  query: string | null;
  /** best_match gets the larger image; the other two roles get a compact one. */
  size: "large" | "thumbnail";
}) {
  const [state, setState] = useState<ImageState>(query ? { status: "loading" } : { status: "empty" });

  useEffect(() => {
    if (!query) {
      setState({ status: "empty" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    fetch(`/api/image?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url: string | null } & Partial<ImageResult>) => {
        if (cancelled) return;
        if (data?.url && data.photographerName && data.photographerUrl && data.sourceUrl) {
          setState({
            status: "loaded",
            result: {
              url: data.url,
              photographerName: data.photographerName,
              photographerUrl: data.photographerUrl,
              sourceUrl: data.sourceUrl,
            },
          });
        } else {
          setState({ status: "empty" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "empty" });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  // Thumbnail is narrower than before (140px, was 200px) so best_match plus
  // two secondary images don't stack up into an excessively long mobile
  // page — a little more compact, not a different shape (still landscape,
  // matching what Pexels was asked to search for).
  const boxClass = `w-full overflow-hidden rounded-xl bg-accent-soft/40 ${
    size === "large" ? "aspect-video" : "aspect-[4/3] max-w-[140px]"
  }`;

  if (state.status === "loading") {
    return <div className={`${boxClass} mb-3 animate-pulse`} aria-hidden="true" />;
  }

  if (state.status === "empty") {
    return (
      <div className={`${boxClass} mb-3 flex items-center justify-center`} aria-hidden="true">
        <span className="text-2xl opacity-40">🍽️</span>
      </div>
    );
  }

  const { url, photographerName, photographerUrl, sourceUrl } = state.result;
  return (
    <figure className="mb-3">
      <div className={boxClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external, unconfigured host; kept simple for MVP */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </div>
      <figcaption className="mt-1 text-[11px] text-muted">
        Photo by{" "}
        <a href={photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {photographerName}
        </a>{" "}
        on{" "}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          Pexels
        </a>
      </figcaption>
    </figure>
  );
}
