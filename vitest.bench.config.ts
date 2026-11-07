// Config for `npm run bench:recommend` only. The normal `npm test` never picks
// the benchmark up: it spends real money and needs ANTHROPIC_API_KEY.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// .env.local is where the key lives; workers inherit what is loaded here.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No file: the key may already be in the environment.
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["scripts/recommend-benchmark.ts"],
    testTimeout: 15 * 60_000,
    fileParallelism: false,
  },
});
