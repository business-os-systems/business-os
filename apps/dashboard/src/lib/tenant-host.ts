/**
 * Request host binding for tenant sessions (FR-111, FR-113).
 *
 * A session is issued for the host that authenticated it and is rejected when
 * its signed claim names another host. The Host header is normalized through
 * @suite/core so a port, casing or trailing dot cannot dodge the check.
 */

import { readNormalizedRequestHost } from "@suite/core";
import type { SessionPayload } from "@/lib/auth-constants";

export interface RequestHostSource {
  readonly headers: Headers;
  readonly nextUrl?: URL;
}

/**
 * Reads the request host through the one shared normalizer: the Host header
 * first, then a proxy's forwarded header, then the parsed request URL.
 */
export function readRequestHostname(source: RequestHostSource): string | null {
  return readNormalizedRequestHost({
    headers: source.headers,
    fallbackHost: source.nextUrl?.host ?? null,
  });
}

/** Records the issuing tenant host on a freshly created session payload. */
export function bindSessionToRequestHost(
  payload: SessionPayload,
  hostname: string | null
): SessionPayload {
  if (hostname === null) {
    return payload;
  }
  return { ...payload, tenantHost: hostname };
}