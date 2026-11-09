import { prisma } from "@suite/db";
import {
  decodeSessionPayload,
  listUserTenants,
  switchActiveBranch,
  switchActiveTenant,
  verifySessionToken,
  UnauthorizedError,
} from "@suite/auth";

/** Verifies the signed session and returns the decoded claims or 401. */
export async function readSessionPayload(sessionToken: string) {
  const isValid = await verifySessionToken(sessionToken);
  if (!isValid) {
    throw new UnauthorizedError("Authentication required. Invalid session token.");
  }

  const payload = decodeSessionPayload(sessionToken);
  if (!payload?.userId) {
    throw new UnauthorizedError("Authentication required. Missing user identity.");
  }

  return payload;
}

export async function switchSessionBranch(sessionToken: string, branchId: string) {
  return switchActiveBranch({ sessionToken, branchId, prisma });
}

export async function listSessionTenants(sessionToken: string) {
  const payload = await readSessionPayload(sessionToken);
  return listUserTenants(payload.userId, prisma);
}

export async function switchSessionTenant(
  sessionToken: string,
  organizationId: string
) {
  const payload = await readSessionPayload(sessionToken);
  return switchActiveTenant({
    userId: payload.userId,
    targetOrganizationId: organizationId,
    prisma,
  });
}
