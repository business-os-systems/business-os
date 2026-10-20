import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@suite/core/errors";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { hashPin, verifyPin } from "./pin-engine.js";

export const OVERRIDE_TOKEN_TTL_MS = 60 * 1000; // 60 seconds

export interface VerifyManagerOverrideParams {
  managerPin: string;
  action: string;
  targetEntityId: string;
  reason: string;
  organizationId: string;
  secretKey: string;
  prisma: PrismaClient;
  managerUserId?: string;
}

export interface ManagerOverrideVerificationResult {
  verified: true;
  managerUserId: string;
  managerName: string;
  overrideToken: string;
  expiresAt: string;
}

export interface OverrideTokenClaims {
  managerUserId: string;
  organizationId: string;
  action: string;
  targetEntityId: string;
  expiresAt: number;
}

/**
 * Creates an HMAC-SHA256 signature for the given payload string.
 */
function createSignature(payload: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(payload).digest("base64url");
}

/**
 * Verifies a Manager Financial & Anti-Theft Override PIN for a privileged action,
 * minting a 60-second HMAC override token scoped specifically to that action and target entity.
 */
export async function verifyManagerOverridePin(
  params: VerifyManagerOverrideParams
): Promise<ManagerOverrideVerificationResult> {
  const {
    managerPin,
    action,
    targetEntityId,
    reason,
    organizationId,
    secretKey,
    prisma,
  } = params;

  if (!/^\d{4,8}$/.test(managerPin)) {
    throw new ValidationError("Manager PIN must be 4 to 8 numeric digits", [
      { name: "managerPin", reason: "Manager PIN must be 4 to 8 numeric digits" },
    ]);
  }

  if (!action || action.length < 3 || action.length > 64) {
    throw new ValidationError("Action must be between 3 and 64 characters", [
      { name: "action", reason: "Action must be between 3 and 64 characters" },
    ]);
  }

  if (!targetEntityId) {
    throw new ValidationError("Target entity ID is required", [
      { name: "targetEntityId", reason: "Target entity ID is required" },
    ]);
  }

  if (!reason || reason.length < 5 || reason.length > 255) {
    throw new ValidationError("Anti-theft justification reason must be between 5 and 255 characters", [
      { name: "reason", reason: "Reason must be between 5 and 255 characters" },
    ]);
  }

  // Find active users in this organization who possess a manager PIN hash
  const activeMembersWithPin = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      ...(params.managerUserId ? { userId: params.managerUserId } : {}),
      user: {
        managerPinHash: { not: null },
      },
    },
    include: {
      user: {
        include: {
          branchRoles: {
            where: { organizationId },
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (activeMembersWithPin.length === 0) {
    throw new ForbiddenError("No managers configured for this organization with override credentials", {
      code: "PIN_INVALID",
    });
  }

  // Check each potential manager's PIN
  for (const member of activeMembersWithPin) {
    const candidateUser = member.user;
    if (candidateUser.managerPinHash && (await verifyPin(managerPin, candidateUser.managerPinHash))) {
      // PIN matched! Verify manager has override authority via pure capability checks
      const hasManagerAuthority = candidateUser.branchRoles.some((br) => {
        const actions = br.role.permissions
          .map((p) => p.permission?.action)
          .filter((a): a is string => Boolean(a));

        return (
          hasPermission(actions, PERMISSIONS.WILDCARD) ||
          hasPermission(actions, PERMISSIONS.CORE.ALL) ||
          hasPermission(actions, PERMISSIONS.CORE.USERS_MANAGE) ||
          hasPermission(actions, "manager_override:verify") ||
          hasPermission(actions, "manager_override:execute")
        );
      });

      if (!hasManagerAuthority) {
        throw new ForbiddenError(
          "User possesses a valid PIN but lacks manager override permissions in this organization",
          { code: "AUTH_UNAUTHORIZED" }
        );
      }

      const expiresAtMs = Date.now() + OVERRIDE_TOKEN_TTL_MS;
      const expiresAtIso = new Date(expiresAtMs).toISOString();

      const claims: OverrideTokenClaims = {
        managerUserId: candidateUser.id,
        organizationId,
        action,
        targetEntityId,
        expiresAt: expiresAtMs,
      };

      const serializedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const signature = createSignature(serializedClaims, secretKey);
      const overrideToken = `${serializedClaims}.${signature}`;

      return {
        verified: true,
        managerUserId: candidateUser.id,
        managerName: candidateUser.name,
        overrideToken,
        expiresAt: expiresAtIso,
      };
    }
  }

  throw new UnauthorizedError("Invalid manager override PIN entered", {
    code: "PIN_INVALID",
  });
}

export interface VerifyOverrideTokenParams {
  overrideToken: string;
  expectedAction: string;
  expectedTargetEntityId: string;
  secretKey: string;
}

export interface ValidatedOverrideToken {
  valid: true;
  claims: OverrideTokenClaims;
}

/**
 * Validates a 60-second HMAC override token before executing a sensitive financial or anti-theft operation.
 */
export function verifyOverrideToken(
  params: VerifyOverrideTokenParams
): ValidatedOverrideToken {
  const { overrideToken, expectedAction, expectedTargetEntityId, secretKey } = params;

  if (!overrideToken || !overrideToken.includes(".")) {
    throw new UnauthorizedError("Malformed override token format", {
      code: "OVERRIDE_TOKEN_INVALID",
    });
  }

  const [serializedClaims, signature] = overrideToken.split(".");
  if (!serializedClaims || !signature) {
    throw new UnauthorizedError("Malformed override token components", {
      code: "OVERRIDE_TOKEN_INVALID",
    });
  }

  const expectedSignature = createSignature(serializedClaims, secretKey);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new UnauthorizedError("Invalid override token cryptographic signature", {
      code: "OVERRIDE_TOKEN_INVALID",
    });
  }

  let claims: OverrideTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(serializedClaims, "base64url").toString("utf-8"));
  } catch {
    throw new UnauthorizedError("Could not deserialize override token claims", {
      code: "OVERRIDE_TOKEN_INVALID",
    });
  }

  if (Date.now() > claims.expiresAt) {
    throw new UnauthorizedError("Manager override token has expired", {
      code: "OVERRIDE_TOKEN_EXPIRED",
    });
  }

  if (claims.action !== expectedAction) {
    throw new ForbiddenError(
      `Override token is scoped for action [${claims.action}], not [${expectedAction}]`,
      { code: "OVERRIDE_TOKEN_INVALID" }
    );
  }

  if (claims.targetEntityId !== expectedTargetEntityId) {
    throw new ForbiddenError(
      `Override token is scoped for entity [${claims.targetEntityId}], not [${expectedTargetEntityId}]`,
      { code: "OVERRIDE_TOKEN_INVALID" }
    );
  }

  return {
    valid: true,
    claims,
  };
}

export interface SetManagerOverridePinParams {
  userId: string;
  newManagerPin: string;
  prisma: PrismaClient;
}

/**
 * Sets or updates the 4-8 digit manager financial override PIN for a user.
 */
export async function setManagerOverridePin(
  params: SetManagerOverridePinParams
): Promise<{ updatedAt: string; message: string }> {
  const { userId, newManagerPin, prisma } = params;

  if (!/^\d{4,8}$/.test(newManagerPin)) {
    throw new ValidationError("Manager override PIN must be 4 to 8 numeric digits", [
      { name: "newManagerPin", reason: "Manager override PIN must be 4 to 8 numeric digits" },
    ]);
  }

  const hashedPin = await hashPin(newManagerPin);

  await prisma.user.update({
    where: { id: userId },
    data: {
      managerPinHash: hashedPin,
      updatedAt: new Date(),
    },
  });

  return {
    updatedAt: new Date().toISOString(),
    message: "Manager override PIN updated successfully",
  };
}
