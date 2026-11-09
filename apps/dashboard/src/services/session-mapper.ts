import {
  getUserOnboardingState,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";

export interface SessionIdentityView {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly metadata: unknown;
}

export interface OrganizationMembershipView {
  readonly organization?: { readonly id: string; readonly name: string } | null;
}

export interface BranchRoleView {
  readonly branchId?: string | null;
  readonly branch?: { readonly name: string } | null;
  readonly role?: { readonly name?: string; readonly slug?: string } | null;
}

export interface MappedIdentity {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
}

export interface MappedOrganization {
  readonly organizationId?: string;
  readonly organizationName?: string;
}

export interface MappedBranch {
  readonly activeBranchId?: string;
  readonly activeBranchName?: string;
}

export interface MappedOnboarding {
  readonly onboardingStatus: OnboardingStatus;
  readonly currentOnboardingStep?: number;
  readonly themePreference: ThemePreference;
}

export function mapIdentity(user: SessionIdentityView): MappedIdentity {
  return { userId: user.id, email: user.email, userName: user.name };
}

export function mapOrganization(
  memberships: readonly OrganizationMembershipView[]
): MappedOrganization {
  const organization = memberships[0]?.organization;
  if (!organization) {
    return { organizationId: undefined, organizationName: undefined };
  }
  return { organizationId: organization.id, organizationName: organization.name };
}

export function mapBranch(branchRole: BranchRoleView | undefined): MappedBranch {
  if (!branchRole) {
    return { activeBranchId: undefined, activeBranchName: undefined };
  }
  return {
    activeBranchId: branchRole.branchId ?? undefined,
    activeBranchName: branchRole.branch?.name ?? undefined,
  };
}

export function mapOnboarding(metadata: unknown): MappedOnboarding {
  const state = getUserOnboardingState(metadata);
  return {
    onboardingStatus: state.onboardingStatus,
    currentOnboardingStep: state.currentOnboardingStep ?? undefined,
    themePreference: state.themePreference,
  };
}
