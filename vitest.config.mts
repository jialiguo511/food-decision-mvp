import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the "@/*" → "src/*" path alias in tsconfig.json, for tests that
  // import app code (e.g. the API route).
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Component tests call function components directly; JSX must compile without
  // the "preserve" setting Next.js uses in tsconfig.json.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
  },
});
