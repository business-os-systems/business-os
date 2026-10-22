/**
 * Centralized Environment Configuration Helper (@suite/logger)
 * Single source of truth for runtime environment detection and configuration.
 */

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
