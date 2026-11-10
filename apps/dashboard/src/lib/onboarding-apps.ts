import { APP_MANIFESTS, type AppManifest } from "@suite/core";

const UNIVERSAL_INDUSTRY = "*";

/**
 * The onboarding picker offers exactly the applications the compiled registry
 * defines. The registry is also the source of truth for the Platform catalog
 * (FR-082), so registering an app is the only way to make it selectable here.
 */
export function listOnboardingApps(): readonly AppManifest[] {
  return Object.values(APP_MANIFESTS);
}

/**
 * An app is recommended when it targets every industry or when one of its
 * target industries matches the tenant's selected industries.
 */
export function isAppRecommended(
  app: AppManifest,
  userIndustries: readonly string[]
): boolean {
  if (app.targetIndustries.includes(UNIVERSAL_INDUSTRY)) {
    return true;
  }
  if (userIndustries.length === 0) {
    return false;
  }
  return app.targetIndustries.some((industry) =>
    userIndustries.includes(industry)
  );
}

/**
 * Human-readable industry summary for the picker. The registry's wildcard
 * marks an app that is relevant to every tenant.
 */
export function describeTargetIndustries(app: AppManifest): string {
  if (app.targetIndustries.includes(UNIVERSAL_INDUSTRY)) {
    return "All industries";
  }
  return app.targetIndustries.join(" · ");
}

export interface OnboardingAppGroups {
  readonly recommended: readonly AppManifest[];
  readonly additional: readonly AppManifest[];
}

export function groupOnboardingApps(
  userIndustries: readonly string[]
): OnboardingAppGroups {
  const recommended: AppManifest[] = [];
  const additional: AppManifest[] = [];

  for (const app of listOnboardingApps()) {
    if (isAppRecommended(app, userIndustries)) {
      recommended.push(app);
    } else {
      additional.push(app);
    }
  }

  return { recommended, additional };
}
