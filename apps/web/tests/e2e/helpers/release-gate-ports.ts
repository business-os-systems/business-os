/**
 * Ports bound by the release-gate web servers.
 *
 * The runner and the specs import this single declaration so a port change can
 * never leave the dashboard origin and the webServer probe out of sync.
 *
 * These are deliberately outside the developer stack (dashboard 3001, platform
 * 3002, storefront 3003). A gate that binds 3001 silently reuses a running dev
 * server and then tests whatever code that process started with.
 */
export const RELEASE_GATE_DASHBOARD_PORT = 3101;
export const RELEASE_GATE_WEB_PORT = 3103;
