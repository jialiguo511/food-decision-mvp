import type { ReactNode, RefObject } from "react";

/** The fixed frame every card picture lives in — loading, loaded, no picture
 *  and failed all occupy the same box and the same caption line, so nothing
 *  below it moves when the state changes. */
export default function MediaFrame({
  size,
  state,
  cause,
  frameRef,
  caption,
  children,
}: {
  size: "large" | "thumbnail";
  /** Mirrored to a data attribute so a browser (or a test) can tell the states apart. */
  state: "waiting" | "loading" | "ready" | "none" | "failed";
  cause?: string;
  frameRef?: RefObject<HTMLDivElement | null>;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  const box = size === "large" ? "aspect-video w-full" : "aspect-[4/3] w-full max-w-[140px]";
  return (
    <figure className="mb-3" data-image-state={state} data-image-cause={cause}>
      <div ref={frameRef} className={`relative overflow-hidden rounded-xl bg-accent-soft/40 ${box} ${state === "loading" ? "animate-pulse" : ""}`}>
        {children}
      </div>
      <figcaption className="mt-1 min-h-4 text-[11px] leading-4 text-muted">{caption}</figcaption>
    </figure>
  );
}

/** Centered icon + short line inside the frame, with an optional action. */
export function FramePlaceholder({ size, text, action }: { size: "large" | "thumbnail"; text: string; action?: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-accent/70">
      <PlateIcon />
      {size === "large" && <span className="text-xs">{text}</span>}
      {action}
    </div>
  );
}

export function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}
