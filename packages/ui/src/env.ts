/**
 * Centralized Environment Configuration Helper (@suite/ui)
 * Single source of truth for runtime host environment detection.
 */

export const isBrowser = typeof window !== "undefined";
export const isServer = !isBrowser;
