"use client";

import { useEffect, useState, type RefObject } from "react";

/** True once the element is near the viewport (and stays true). Things that cost
 *  something to fetch — a generated recipe picture, a billed place photo — wait
 *  for the card to be about to be seen, so a card scrolled out of sight in the
 *  carousel never pays for one. Without IntersectionObserver, always true. */
export function useNearViewport(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}
