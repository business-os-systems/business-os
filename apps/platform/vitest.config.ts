import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Next compiles JSX with the automatic runtime; the test transform must match
  // or a component that omits the React import fails to render.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: { environment: "node" },
});
