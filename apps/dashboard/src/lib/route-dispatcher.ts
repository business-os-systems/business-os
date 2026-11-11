/**
 * Extensible Post-Login Route Resolution Dispatcher
 * Complies with SPEC-AUTH-001 Section 5.1 and Section 6.1.
 * Evaluates role hierarchy, permissions, and app licenses to determine
 * whether a user lands on the executive dashboard or directly into a designated app.
 */

import { workspacePath } from "@/lib/workspace-paths";

/**
 * Dynamic permissions context for route dispatching (ISP & SRP).
 * Evaluates purely dynamic permission tokens (e.g. "pos:orders:create", "*").
 */
export interface RouteAuthorizationContext {
  permissions?: string[];
  roleSlug?: string;
}

/**
 * Application entitlement mappings (ISP & SRP).
 */
export interface RouteAppEntitlementsContext {
  assignedAppIds?: string[];
  assignedAppCodes?: string[];
}

/**
 * Onboarding lifecycle state (ISP & SRP).
 */
export interface RouteOnboardingStateContext {
  onboardingStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentOnboardingStep?: number | null;
}

/**
 * Composite context for post-login destination routing.
 */
export interface RouteDispatchContext
  extends RouteAuthorizationContext,
    RouteAppEntitlementsContext,
    RouteOnboardingStateContext {}

// Canonical application route registry mapping modular app IDs to entry roots
const APP_ROUTES = new Map<string, string>([
  ["cms", workspacePath("/sites")],
  ["sites", workspacePath("/sites")],
  ["website_builder", workspacePath("/sites")],
  ["pms", workspacePath("/pms")],
  ["lodging_pms", workspacePath("/pms")],
  ["pos", workspacePath("/pos")],
  ["restaurant_pos", workspacePath("/pos")],
  ["inventory", workspacePath("/inventory")],
  ["stock_inventory", workspacePath("/inventory")],
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

/**
 * Resolves post-login destination URL through a pure dynamic permission pipeline:
 * 1. Incomplete onboarding step gate (/onboarding/step-N)
 * 2. Single assigned application direct handoff (e.g. /pos)
 * 3. Pure dynamic permission domain evaluation:
 *    - Frontline operator restricted to a single domain (e.g. only "pos:*" or "cms:*") -> direct app route
 *    - Broad, wildcard, multi-domain, or root permissions -> /dashboard
 * 4. Default workspace dashboard fallback (/dashboard)
 */
export function resolvePostLoginRoute(context: RouteDispatchContext): string {
  // 1. Incomplete onboarding gate
  if (context.onboardingStatus && context.onboardingStatus !== "COMPLETED") {
    const step =
      context.currentOnboardingStep && context.currentOnboardingStep > 0
        ? context.currentOnboardingStep
        : 1;
    return `/onboarding/step-${step}`;
  }

  // 2. Single-app direct handoff via assigned application entitlements
  const apps =
    context.assignedAppIds && context.assignedAppIds.length > 0
      ? context.assignedAppIds
      : context.assignedAppCodes;
  if (apps && apps.length === 1) {
    const targetRoute = getAppRoute(apps[0]!);
    if (targetRoute) {
      return targetRoute;
    }
  }

  // 3. Dynamic permissions inspection
  if (context.permissions && context.permissions.length > 0) {
    // Wildcard, root management, or workspace-level permissions always land on dashboard overview
    const hasGlobalScope = context.permissions.some(
      (p) =>
        p === "*" ||
        p.startsWith("dashboard:") ||
        p.startsWith("workspace:") ||
        p.startsWith("organization:") ||
        p.startsWith("system:")
    );

    if (hasGlobalScope) {
      return "/dashboard";
    }

    const activeAppDomains = new Set<string>();
    for (const perm of context.permissions) {
      const domain = perm.split(":")[0]?.toLowerCase();
      if (domain) {
        activeAppDomains.add(domain);
      }
    }

    // Frontline operator whose permissions strictly belong to a single application domain
    if (activeAppDomains.size === 1) {
      const [onlyDomain] = Array.from(activeAppDomains);
      const targetRoute = getAppRoute(onlyDomain!);
      if (targetRoute) {
        return targetRoute;
      }
    }
  }

  // 4. Default workspace dashboard fallback
  return "/dashboard";
}
