"use client";

import { Children, useEffect, useRef, useState } from "react";

/**
 * One card at a time, with the next one peeking in. Swipe is native
 * scroll-snap; arrows and dots do the same thing for mouse and keyboard.
 *
 * Browsing only: moving between cards records nothing and calls nothing —
 * swiping past a card is not "dislike", lingering on one is not "like".
 * Preference is only ever the explicit buttons on the cards.
 */
export default function Carousel({
  children,
  initialIndex = 0,
  label,
}: {
  children: React.ReactNode;
  /** Card to show first, e.g. the chosen one on a restored session. */
  initialIndex?: number;
  label: string;
}) {
  const items = Children.toArray(children);
  const count = items.length;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(Math.min(initialIndex, Math.max(count - 1, 0)));

  const slides = () => Array.from(track.current?.children ?? []) as HTMLElement[];

  // The track takes the ACTIVE card's height, not the tallest card's — so an
  // expanded recipe on one card doesn't leave a gap under a short one. Follows
  // the card as it grows or shrinks (View recipe / More).
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const slide = slides()[active];
    if (!slide || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(slide.offsetHeight));
    observer.observe(slide);
    return () => observer.disconnect();
  }, [active, count]);

  function go(index: number, smooth = true) {
    const el = track.current;
    const slide = slides()[index];
    if (!el || !slide) return;
    setActive(index);
    // The track is `relative`, so offsetLeft is measured inside it.
    el.scrollTo({ left: slide.offsetLeft - padStart(el), behavior: smooth ? "smooth" : "auto" });
  }

  // Land on the requested card without animating (restore / chosen card).
  useEffect(() => {
    if (initialIndex > 0) go(Math.min(initialIndex, count - 1), false);
    // Only on mount — later changes are the user's own browsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const el = track.current;
    if (!el) return;
    // The slide whose left edge is nearest the track's visible start. At the
    // far end the last card can't reach the start, so max scroll = last card.
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (atEnd) return setActive(count - 1);
    const start = el.scrollLeft + padStart(el);
    let nearest = 0;
    slides().forEach((slide, i) => {
      if (Math.abs(slide.offsetLeft - start) < Math.abs(slides()[nearest].offsetLeft - start)) nearest = i;
    });
    setActive(nearest);
  }

  return (
    <section aria-roledescription="carousel" aria-label={label}>
      <div
        ref={track}
        onScroll={onScroll}
        style={height ? { height: height + 4 } : undefined}
        className="no-scrollbar relative -mx-5 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-5 scroll-px-5 pb-1 transition-[height] duration-200"
      >
        {items.map((item, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            className={`shrink-0 snap-start ${count > 1 ? "w-[calc(100%-1.75rem)]" : "w-full"}`}
          >
            {item}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <Arrow dir="prev" disabled={active === 0} onClick={() => go(active - 1)} />
          <div className="flex items-center gap-1.5" aria-hidden>
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === active ? "w-5 bg-accent" : "w-1.5 bg-line"}`}
              />
            ))}
          </div>
          <span className="min-w-12 text-center text-xs font-medium text-muted" aria-live="polite">
            {active + 1} of {count}
          </span>
          <Arrow dir="next" disabled={active === count - 1} onClick={() => go(active + 1)} />
        </div>
      )}
    </section>
  );
}

const padStart = (el: HTMLElement) => parseFloat(getComputedStyle(el).paddingLeft) || 0;

function Arrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous option" : "Next option"}
      className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-card text-ink disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
