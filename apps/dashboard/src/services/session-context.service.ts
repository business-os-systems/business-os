import { prisma } from "@suite/db";
import {
  listUserTenants,
  switchActiveBranch,
  switchActiveTenant,
  type UserTenantMembership,
} from "@suite/auth";

export function listUserWorkspaces(userId: string): Promise<UserTenantMembership[]> {
  return listUserTenants(userId, prisma);
}

export async function hasAccessibleWorkspace(userId: string): Promise<boolean> {
  const tenants = await listUserTenants(userId, prisma);
  return tenants.length > 0;
}

export async function switchBranchSession(input: {
  readonly sessionToken: string;
  readonly branchId: string;
}) {
  const result = await switchActiveBranch({
    sessionToken: input.sessionToken,
    branchId: input.branchId,
    prisma,
  });
  return result.data;
}

export function switchTenantSession(input: {
  readonly userId: string;
  readonly organizationId: string;
}) {
  return switchActiveTenant({
    userId: input.userId,
    targetOrganizationId: input.organizationId,
    prisma,
  });
}
