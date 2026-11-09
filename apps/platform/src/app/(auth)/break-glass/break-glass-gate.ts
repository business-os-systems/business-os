/**
 * The break-glass admission decision.
 *
 * Caddy terminates the separate break-glass hostname with a required client
 * certificate, then overwrites this request header before proxying to the app.
 * The app never reads or stores the offline key itself. A missing or different
 * header is a generic denial, never a hint that the route exists.
 */
export const BREAK_GLASS_HEADER = "x-break-glass-verified";
const BREAK_GLASS_ADMITTED_VALUE = "1";

export function isBreakGlassAdmitted(headerValue: string | null | undefined): boolean {
  return headerValue === BREAK_GLASS_ADMITTED_VALUE;
}
