/**
 * Ports bound by the release-gate web servers.
 *
 * The runner and the specs import this single declaration so a port change can
 * never leave the dashboard origin and the webServer probe out of sync.
 */
export const RELEASE_GATE_DASHBOARD_PORT = 3001;
