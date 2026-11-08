// Per-request stage timing for the recommendation routes. Server-only.
//
// "Where does the time actually go?" has to be answered from numbers, not
// guesses, so each route wraps its stages in a Timer and the finished table is
// logged once per request (and sent as a Server-Timing header, which browser
// devtools show under Network → Timing):
//
//   [Cook timing 3f9a1c2e]
//     auth                  120 ms
//     preferences           100 ms   profile 100 · staples 60 · hints 80 (parallel)
//     prompt                  8 ms
//     model                6200 ms
//     parse                  30 ms
//     session write         180 ms   persist 180 · saved_state 90 (parallel)
//     other                  40 ms
//     ------------------------------
//     TOTAL                6678 ms
//
// Two kinds of measurement, so overlapping work is never double-counted:
//   - a STAGE is one step on the critical path (they run one after another);
//     a stage that wraps parallel reads reports its wall-clock time.
//   - a PART is one of the parallel reads inside a stage — shown beside it and
//     in the Server-Timing header, but never added to the rows.
// `other` is whatever wall-clock time no stage covers. The id ties the table to
// the browser's request (X-Request-Id), so one tap can be followed end to end.
// Timing contains no user content — only names and milliseconds.

export type StageTimes = Record<string, number>;

export type Timer = {
  /** Runs `fn` as one critical-path stage, recording how long it took under
   *  `name` (even if it throws). Stages must not overlap each other. */
  stage<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  /** Runs `fn` as one of several reads happening together INSIDE `stage`:
   *  shown beside that stage's row, never added to the rows. */
  part<T>(stage: string, name: string, fn: () => Promise<T> | T): Promise<T>;
  /** Records a critical-path duration measured elsewhere. Adds to an existing stage. */
  record(name: string, ms: number): void;
  /** Milliseconds since the timer started. */
  elapsed(): number;
  /** Stage durations so far, in the order first recorded. */
  stages(): StageTimes;
  /** Parallel-read durations so far, by name. */
  parts(): StageTimes;
  /** The table above, as one string. */
  format(): string;
  /** `Server-Timing` header value, e.g. `model;dur=5400, total;dur=5847`. */
  header(): string;
  /** The route only knows the mode once the body is parsed. */
  setLabel(label: string): void;
  /** The browser's id for this request, so the logs line up. */
  setRequestId(id: string | null): void;
  /** The browser's id for this request, if it sent one. */
  requestId(): string | null;
  /** Logs the table (once). Safe to call on every exit path. */
  report(): void;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const display = (name: string) => name.replace(/_/g, " ");
/** Server-Timing metric names are HTTP tokens: no spaces or punctuation. */
const metric = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, "_");

export function createTimer(initialLabel: string, now: () => number = performance.now.bind(performance), initialRequestId: string | null = null): Timer {
  const startedAt = now();
  let label = initialLabel;
  let requestId = initialRequestId;
  const stages: StageTimes = {};
  const parts: StageTimes = {};
  const partsOf: Record<string, StageTimes> = {};
  let reported = false;

  const record = (name: string, ms: number) => {
    stages[name] = round1((stages[name] ?? 0) + ms);
  };
  const elapsed = () => Math.round(now() - startedAt);

  const format = () => {
    const ms = (n: number) => `${String(Math.round(n)).padStart(6)} ms`;
    const total = elapsed();
    const covered = Object.values(stages).reduce((sum, v) => sum + v, 0);
    const rows = Object.entries(stages).map(([name, v]) => {
      const inner = Object.entries(partsOf[name] ?? {})
        .map(([part, d]) => `${display(part)} ${Math.round(d)}`)
        .join(" · ");
      return `  ${display(name).padEnd(16)}${ms(v)}${inner ? `   (in parallel: ${inner})` : ""}`;
    });
    const other = Math.max(0, total - covered);
    if (rows.length > 0) rows.push(`  ${"other".padEnd(16)}${ms(other)}`);
    return [
      `[${label} timing${requestId ? ` ${requestId}` : ""}]`,
      ...rows,
      `  ${"-".repeat(28)}`,
      `  ${"TOTAL".padEnd(16)}${ms(total)}`,
    ].join("\n");
  };

  return {
    stage: async (name, fn) => {
      const t0 = now();
      try {
        return await fn();
      } finally {
        record(name, now() - t0);
      }
    },
    part: async (stage, name, fn) => {
      const t0 = now();
      try {
        return await fn();
      } finally {
        parts[name] = round1((parts[name] ?? 0) + (now() - t0));
        (partsOf[stage] ??= {})[name] = parts[name];
      }
    },
    record,
    setLabel(next) {
      label = next;
    },
    requestId: () => requestId,
    setRequestId(id) {
      requestId = id;
    },
    elapsed,
    stages: () => ({ ...stages }),
    parts: () => ({ ...parts }),
    format,
    header: () =>
      [...Object.entries(stages), ...Object.entries(parts), ["total", elapsed()] as const].map(([name, v]) => `${metric(name)};dur=${Math.round(v)}`).join(", "),
    report() {
      if (reported) return;
      reported = true;
      console.info(format());
    },
  };
}
