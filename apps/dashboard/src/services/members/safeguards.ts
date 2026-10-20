import { prisma } from "@suite/db";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { SafeguardViolationError } from "./types";

/**
 * Evaluates whether a role grants organizational administrative capabilities.
 * 100% capability-driven evaluating PERMISSIONS.WILDCARD (*), PERMISSIONS.CORE.ALL (core:*),
 * or PERMISSIONS.CORE.USERS_MANAGE (core:users:manage).
 */
export function isAdministrativeRole(role: {
  permissions?: Array<{ permission?: { action?: string } | null } | string> | null;
}): boolean {
  if (!role?.permissions || !Array.isArray(role.permissions)) return false;

  const actions: string[] = role.permissions
    .map((p) => {
      if (typeof p === "string") return p;
      return p?.permission?.action;
    })
    .filter((a): a is string => Boolean(a));

  return (
    hasPermission(actions, PERMISSIONS.WILDCARD) ||
    hasPermission(actions, PERMISSIONS.CORE.ALL) ||
    hasPermission(actions, PERMISSIONS.CORE.USERS_MANAGE)
  );
}

/**
 * Counts the number of other active administrators in the organization using pure capability checks.
 */
export async function countOtherActiveAdmins(
  organizationId: string,
  excludeUserOrgId: string,
  dbClient: Pick<typeof prisma, "userOrganization"> = prisma
): Promise<number> {
  return await dbClient.userOrganization.count({
    where: {
      organizationId,
      status: "ACTIVE",
      id: { not: excludeUserOrgId },
      user: {
        branchRoles: {
          some: {
            organizationId,
            role: {
              permissions: {
                some: {
                  permission: {
                    action: {
                      in: [
                        PERMISSIONS.WILDCARD,
                        PERMISSIONS.CORE.ALL,
                        PERMISSIONS.CORE.USERS_MANAGE,
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Resolves the primary organization owner's user ID from organization metadata or creation order.
 */
export async function getPrimaryOwnerUserId(
  organizationId: string,
  dbClient: Pick<typeof prisma, "organization" | "userOrganization"> = prisma
): Promise<string | undefined> {
  const org = await dbClient.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });

  const earliestUo = await dbClient.userOrganization.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  interface OrgMetadataRecord {
    creatorUserId?: string;
  }

  const orgMetadata =
    org?.metadata && typeof org.metadata === "object"
      ? (org.metadata as OrgMetadataRecord)
      : null;

  return orgMetadata?.creatorUserId ?? earliestUo?.userId;
}

/**
 * Enforces Primary Owner Immunity Safeguard.
 */
export function assertNotPrimaryOwner(
  creatorUserId: string | undefined,
  targetUserId: string,
  actionDescription: "suspend" | "remove"
): void {
  if (creatorUserId && targetUserId === creatorUserId) {
    const message =
      actionDescription === "suspend"
        ? "Cannot suspend the primary organization owner."
        : "The primary organization owner cannot be removed from the organization.";
    throw new SafeguardViolationError(message);
  }
}

/**
 * Enforces Last-Admin Protection Safeguard.
 */
export function assertNotLastAdmin(
  otherActiveAdminsCount: number,
  actionDescription: "demote" | "suspend" | "remove"
): void {
  if (otherActiveAdminsCount === 0) {
    throw new SafeguardViolationError(
      `Cannot ${actionDescription} the last remaining organization administrator.`
    );
  }
}
