import { defineConfig } from "vitest/config";

/**
 * Database integration suites share one PostgreSQL database and several of
 * them truncate platform tables between tests. Running files in parallel makes
 * those resets race with other suites (the CI symptom was a quota read that
 * returned no media row). File-serial execution keeps each suite isolated.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
