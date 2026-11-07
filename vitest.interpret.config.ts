// Config for `npm run check:interpret` only: runs the REAL model on a handful of
// sentences. The normal `npm test` never picks it up — it spends (a little) real
// money and needs ANTHROPIC_API_KEY.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No file: the key may already be in the environment.
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["scripts/interpret-check.ts"], testTimeout: 120_000, fileParallelism: false },
});
