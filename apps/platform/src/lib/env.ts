/**
 * Server-only Platform configuration read through one validated boundary.
 * P14: feature code never reads process.env directly.
 */
export function getBreakGlassProxySecret(): string | undefined {
  const value = process.env.BREAK_GLASS_PROXY_SECRET;
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}
