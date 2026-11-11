/**
 * Per-host robots.txt directives (FR-040, FR-115).
 *
 * One closed registry owns the disallowed planes, so the workspace, API,
 * preview, auth and framework metadata routes can never drift between hosts.
 */

import { ROBOTS_DISALLOWED_PATHS } from "@suite/core";

const USER_AGENT_LINE = "User-agent: *";
const ALLOW_LINE = "Allow: /";

export function buildRobotsTxt(origin: string): string {
  const directives = ROBOTS_DISALLOWED_PATHS.map(
    (path) => "Disallow: " + path
  );
  return [
    USER_AGENT_LINE,
    ALLOW_LINE,
    ...directives,
    "Sitemap: " + origin + "/sitemap.xml",
    "",
  ].join("\n");
}
