// The beat between tapping an answer and moving on, as one tiny thing that can
// hold at most ONE pending move. A tap schedules; a second tap, Back, Continue
// or the final button cancels whatever was pending first — so a quick double tap
// is one navigation (or one request), never two, and a move scheduled by a tap
// can't fire after the user has already gone somewhere else.

export type AdvanceScheduler = {
  /** Replaces any pending move with `move`, to run after the beat. */
  schedule(move: () => void): void;
  /** Drops the pending move, if any. */
  cancel(): void;
  readonly pending: boolean;
};

/** How long a tapped answer stays visible before the next question. */
export const AUTO_ADVANCE_MS = 220;

export function createAdvanceScheduler(ms: number = AUTO_ADVANCE_MS): AdvanceScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    schedule(move) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        move();
      }, ms);
    },
    cancel,
    get pending() {
      return timer !== null;
    },
  };
}
