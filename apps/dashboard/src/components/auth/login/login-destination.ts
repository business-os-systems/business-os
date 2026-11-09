import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";
import { sanitizeRedirect } from "./login-redirect";
import type { LoginSuccessPayload } from "./login-response";

const DEFAULT_DASHBOARD_ROUTE = "/dashboard";

/**
 * Resolves the post-login destination in the documented precedence order:
 * safe query redirect, server redirect, dispatcher route, dashboard.
 */
export function resolveLoginDestination(
  payload: LoginSuccessPayload,
  queryRedirect: string | null
): string {
  const user = payload.user;
  const dispatcherRoute = resolvePostLoginRoute({
    permissions: user?.permissions,
    onboardingStatus: user?.onboardingStatus,
    currentOnboardingStep: user?.currentOnboardingStep,
  });

  return (
    firstNonEmpty(
      sanitizeRedirect(queryRedirect, user?.onboardingStatus),
      payload.redirectUrl ?? null,
      dispatcherRoute,
      DEFAULT_DASHBOARD_ROUTE
    ) ?? DEFAULT_DASHBOARD_ROUTE
  );
}
