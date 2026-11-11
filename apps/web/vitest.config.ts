import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    // Playwright owns tests/e2e/**/*.spec.ts; Vitest owns tests/**/*.test.ts(x).
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
