/**
 * Canonical workspace address registry (FR-109, FR-113).
 *
 * The tenant workspace is served under /dashboard; auth, API and onboarding
 * surfaces stay at the root so a signed-out request can always reach sign-in.
 * Every redirect, link and active-state check goes through this module.
 */

export const WORKSPACE_ROOT = "/dashboard";
const WORKSPACE_ROOT_PREFIX = WORKSPACE_ROOT + "/";

/** Workspace roots that lived at the root before the /dashboard move. */
export const LEGACY_WORKSPACE_ROOTS = ["/settings", "/sites"] as const;

export const AUTHENTICATION_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/link-account",
  "/invite",
  "/verify-expired",
] as const;

export const AUTHENTICATION_ENTRY = "/login";

function withLeadingSlash(pathname: string): string {
  return pathname.startsWith("/") ? pathname : "/" + pathname;
}

/** Maps an internal workspace route to its public /dashboard address. */
export function workspacePath(internalPath: string): string {
  if (internalPath === "" || internalPath === "/") {
    return WORKSPACE_ROOT;
  }
  const withSlash = withLeadingSlash(internalPath);
  if (withSlash === WORKSPACE_ROOT || withSlash.startsWith(WORKSPACE_ROOT_PREFIX)) {
    return withSlash;
  }
  return WORKSPACE_ROOT + withSlash;
}

export function isLegacyWorkspacePath(pathname: string): boolean {
  return LEGACY_WORKSPACE_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(root + "/")
  );
}

export function isAuthenticationPath(pathname: string): boolean {
  return AUTHENTICATION_PATHS.some(
    (root) => pathname === root || pathname.startsWith(root + "/")
  );
}

export function isLoginPath(pathname: string): boolean {
  return pathname === AUTHENTICATION_ENTRY || pathname.startsWith(AUTHENTICATION_ENTRY + "/");
}

/**
 * Declarative active-state resolution for workspace navigation. Settings is a
 * hub, so any child keeps its category active; every other item matches its
 * own subtree only (no scattered pathname substring checks).
 */
export function isWorkspaceNavTargetActive(currentPath: string, itemHref: string): boolean {
  const current = (currentPath.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  const target = (itemHref.split("?")[0] ?? "").replace(/\/+$/, "") || "/";

  if (target === WORKSPACE_ROOT) {
    return current === WORKSPACE_ROOT;
  }
  const settingsRoot = workspacePath("/settings");
  if (target === settingsRoot || target.startsWith(settingsRoot + "/")) {
    return current === settingsRoot || current.startsWith(settingsRoot + "/");
  }
  return current === target || current.startsWith(target + "/");
}