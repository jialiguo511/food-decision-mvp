import { rm } from "node:fs/promises";

// A stale development manifest can survive a crashed or long-running Webpack
// session and make React Server Components reference chunks that no longer
// exist. Start every normal dev session from a clean compiler state.
await rm(".next", { recursive: true, force: true });

console.log("Cleared stale Next.js development cache.");
