import { isCatalogsHubRoute } from "./catalogs-nav.config";
import { isTenantRecordHubRoute } from "./tenant-record-nav.config";

/**
 * One hub-route predicate for the shell. Entering any hub collapses the primary
 * sidebar to the 64px rail (H-3.3); adding a hub is one row here, never an
 * ad-hoc pathname check in a component.
 */
export function isPlatformHubRoute(pathname: string): boolean {
  return isTenantRecordHubRoute(pathname) || isCatalogsHubRoute(pathname);
}
