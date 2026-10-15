/**
 * Extensible Post-Login Route Resolution Dispatcher
 * Complies with SPEC-AUTH-001 Section 5.1 and Section 6.1.
 * Evaluates role hierarchy, permissions, and app licenses to determine
 * whether a user lands on the executive dashboard or directly into a designated app.
 */

export interface RouteDispatchContext {
  roleSlug?: string;
  permissions?: string[];
  assignedAppIds?: string[];
  assignedAppCodes?: string[];
  isSuperAdmin?: boolean;
  onboardingStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentOnboardingStep?: number | null;
}

// Canonical application route registry mapping modular app IDs to entry roots
const APP_ROUTES = new Map<string, string>([
  ["cms", "/sites"],
  ["sites", "/sites"],
  ["website_builder", "/sites"],
  ["pms", "/pms"],
  ["lodging_pms", "/pms"],
  ["pos", "/pos"],
  ["restaurant_pos", "/pos"],
  ["inventory", "/inventory"],
  ["stock_inventory", "/inventory"],
]);

/**
 * Registers or overrides a modular app's root route.
 * Follows Open-Closed Principle allowing modular apps to declare routes dynamically.
 */
export function registerAppRoute(appId: string, route: string): void {
  APP_ROUTES.set(appId.toLowerCase(), route);
}

/**
 * Resolves the root route for a canonical application ID.
 */
export function getAppRoute(appId: string): string | undefined {
  return APP_ROUTES.get(appId.toLowerCase());
}

const MASTER_ROLES = new Set(["owner", "admin", "super-admin", "manager"]);

/**
 * Resolves post-login destination URL through prioritized decision pipeline:
 * 1. Platform Super Admin portal (/super-admin)
 * 2. Incomplete onboarding step gate (/onboarding/step-N)
 * 3. Executive / Master management roles (/dashboard)
 * 4. Single assigned application direct handoff (e.g. /pos)
 * 5. Single permission domain frontline staff (e.g. /sites)
 * 6. Default workspace dashboard fallback (/dashboard)
 */
export function resolvePostLoginRoute(context: RouteDispatchContext): string {
  // 1. Super Admin portal isolation
  if (context.isSuperAdmin || context.roleSlug === "platform-super-admin") {
    return "/super-admin";
  }

  // 2. Incomplete onboarding gate
  if (context.onboardingStatus && context.onboardingStatus !== "COMPLETED") {
    const step = context.currentOnboardingStep && context.currentOnboardingStep > 0
      ? context.currentOnboardingStep
      : 1;
    return `/onboarding/step-${step}`;
  }

  // 3. Master / Executive roles always access executive overview
  const normalizedRole = context.roleSlug?.toLowerCase();
  if (normalizedRole && MASTER_ROLES.has(normalizedRole)) {
    return "/dashboard";
  }

  // 4. Single-app direct handoff via assigned app list
  const apps = context.assignedAppIds || context.assignedAppCodes;
  if (apps && apps.length === 1) {
    const targetRoute = getAppRoute(apps[0]!);
    if (targetRoute) {
      return targetRoute;
    }
  }

  // 5. Frontline staff with permissions strictly restricted to a single app
  if (context.permissions && context.permissions.length > 0) {
    const activeAppDomains = new Set<string>();

    for (const perm of context.permissions) {
      const domain = perm.split(":")[0]?.toLowerCase();
      if (domain && domain !== "platform" && domain !== "dashboard") {
        activeAppDomains.add(domain);
      }
    }

    if (activeAppDomains.size === 1) {
      const [onlyDomain] = Array.from(activeAppDomains);
      const targetRoute = getAppRoute(onlyDomain!);
      if (targetRoute) {
        return targetRoute;
      }
    }
  }

  // 6. Default executive dashboard launcher
  return "/dashboard";
}
