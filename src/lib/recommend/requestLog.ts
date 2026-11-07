// Development trace of the recommendation request's life in the browser, so
// "did that tap cost one model request or two?" is answered from logs, not
// inferred. One line per event, all carrying the request id the browser also
// sends to the server (X-Request-Id) — the server prints the same id on its
// `received` and `model call` lines, so the two consoles line up:
//
//   [recommend] start    requestId=3f9a1c2e mode=cook
//   [recommend] response requestId=3f9a1c2e status=200 ms=6712
//   [recommend] stored   requestId=3f9a1c2e session=… ms=6713
//   [recommend] mounted  requestId=3f9a1c2e state=loading
//   [recommend] reused   requestId=3f9a1c2e (Home attached to the request already running)
//   [recommend] abort    requestId=3f9a1c2e reason=superseded
//
// Development only: nothing is printed in production. No answers, no profile,
// no coordinates — ids, modes and milliseconds.

type Fields = Record<string, string | number | boolean | null | undefined>;

let sink: ((line: string) => void) | null = null;

/** Test hook: collect the lines instead of printing them. */
export function setRequestLogSink(next: ((line: string) => void) | null) {
  sink = next;
}

export function requestLog(event: string, fields: Fields = {}) {
  const line = `[recommend] ${event.padEnd(8)}${Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key}=${value}`)
    .join("")}`;
  if (sink) return sink(line);
  if (process.env.NODE_ENV === "development") console.info(line);
}

/** A short id for one explicit submit. `crypto.randomUUID` only exists in
 *  secure contexts (not on a phone reaching the dev server over plain http),
 *  so fall back rather than throw. */
export function newRequestId(): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
  return (uuid ?? `${Math.random().toString(16).slice(2)}00000000`).replace(/-/g, "").slice(0, 8);
}
