/**
 * Canonical Onboarding Status and User Metadata State Helpers
 * Encapsulates JSON metadata parsing, validation, and serialization.
 * Adheres to Clean Code (Encapsulation) and Canonical Domain Constants Law.
 */

export const ONBOARDING_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export type OnboardingStatus =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

export const VALID_ONBOARDING_STATUSES = new Set<string>(
  Object.values(ONBOARDING_STATUS)
);

export const THEME_PREFERENCES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

export type ThemePreference =
  (typeof THEME_PREFERENCES)[keyof typeof THEME_PREFERENCES];

export const VALID_THEMES = new Set<string>(
  Object.values(THEME_PREFERENCES)
);

export interface UserOnboardingState {
  onboardingStatus: OnboardingStatus;
  currentOnboardingStep: number | null;
  themePreference: ThemePreference;
  activeOrganizationId: string | null;
  selectedApps: string[];
}

/**
 * Safely parses and normalizes user metadata from database JSON into strongly-typed domain state.
 */
export function getUserOnboardingState(rawMetadata: unknown): UserOnboardingState {
  const metadata =
    rawMetadata && typeof rawMetadata === "object"
      ? (rawMetadata as Record<string, unknown>)
      : {};

  const rawStatus = metadata.onboarding_status;
  const onboardingStatus: OnboardingStatus =
    typeof rawStatus === "string" && VALID_ONBOARDING_STATUSES.has(rawStatus)
      ? (rawStatus as OnboardingStatus)
      : ONBOARDING_STATUS.NOT_STARTED;

  const rawStep = metadata.current_onboarding_step;
  const currentOnboardingStep =
    typeof rawStep === "number" && !Number.isNaN(rawStep) ? rawStep : null;

  const rawTheme = metadata.theme_preference;
  const themePreference: ThemePreference =
    typeof rawTheme === "string" && VALID_THEMES.has(rawTheme)
      ? (rawTheme as ThemePreference)
      : THEME_PREFERENCES.SYSTEM;

  const rawOrgId = metadata.active_organization_id;
  const activeOrganizationId =
    typeof rawOrgId === "string" && rawOrgId.length > 0 ? rawOrgId : null;

  const rawApps = metadata.selected_apps;
  const selectedApps = Array.isArray(rawApps)
    ? rawApps.filter((app): app is string => typeof app === "string")
    : [];

  return {
    onboardingStatus,
    currentOnboardingStep,
    themePreference,
    activeOrganizationId,
    selectedApps,
  };
}

/**
 * Merges updated onboarding state back into user metadata record without overwriting unrelated fields.
 */
export function mergeUserOnboardingState(
  rawMetadata: unknown,
  updates: Partial<UserOnboardingState>
): Record<string, unknown> {
  const base =
    rawMetadata && typeof rawMetadata === "object"
      ? { ...(rawMetadata as Record<string, unknown>) }
      : {};

  if (updates.onboardingStatus !== undefined) {
    base.onboarding_status = updates.onboardingStatus;
  }
  if (updates.currentOnboardingStep !== undefined) {
    base.current_onboarding_step = updates.currentOnboardingStep;
  }
  if (updates.themePreference !== undefined) {
    base.theme_preference = updates.themePreference;
  }
  if (updates.activeOrganizationId !== undefined) {
    base.active_organization_id = updates.activeOrganizationId;
  }
  if (updates.selectedApps !== undefined) {
    base.selected_apps = updates.selectedApps;
  }

  return base;
}
