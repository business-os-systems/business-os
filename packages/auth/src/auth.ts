import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, bearer } from "better-auth/plugins";
import type { PrismaClient } from "@suite/db";
import { isProduction, getBetterAuthSecret } from "./env.js";

export interface CreateAuthOptions {
  secret?: string;
  baseURL?: string;
  trustedOrigins?: string[];
  customPlugins?: BetterAuthOptions["plugins"];
}

/**
 * Creates and configures the Better-Auth engine connected to the @suite/db Prisma client.
 * Enforces enterprise tenancy, multi-organization membership, active branch context tracking,
 * and cryptographically secure session cookies.
 */
export function createAuth(prisma: PrismaClient, options: CreateAuthOptions = {}) {
  const secret = options.secret ?? getBetterAuthSecret();

  const baseURL = options.baseURL ?? process.env.BETTER_AUTH_URL;
  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL is required to initialize authentication engine.");
  }

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    secret,
    baseURL,
    trustedOrigins: options.trustedOrigins,
    plugins: [
      organization({
        schema: {
          organization: { modelName: "organization" },
          member: { modelName: "userOrganization" },
          invitation: { modelName: "organizationInvitation" },
        },
      }),
      bearer(),
      ...(options.customPlugins || []),
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        managerPinHash: { type: "string", required: false },
        mobile: { type: "string", required: false },
        metadata: { type: "string", required: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
      additionalFields: {
        activeOrganizationId: { type: "string", required: false },
        activeBranchId: { type: "string", required: false },
      },
    },
    advanced: {
      useSecureCookies: isProduction,
      cookiePrefix: "suite",
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
