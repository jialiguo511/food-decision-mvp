/** How long a saved decision session auto-restores on page open. A session is
 *  temporary state for one eating decision — after this, Home starts fresh
 *  (remembered defaults still apply). Expired rows are kept as history, never
 *  deleted; they just stop being restored. Its own tiny module so client code
 *  (the request store) can share it without pulling in the validators in
 *  session.ts. */
export const SESSION_RESTORE_WINDOW_MS = 6 * 60 * 60 * 1000;
