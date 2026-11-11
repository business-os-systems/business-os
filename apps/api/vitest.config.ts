import { defineConfig } from "vitest/config";

/**
 * Database integration suites share one PostgreSQL database. The catalog,
 * media and quota suites create rows that other suites' pagination/usage
 * assertions can observe, so files run serially to keep each suite isolated.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
