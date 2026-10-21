import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@suite/db";
import {
  exchangeOAuthCode,
  createAccountLinkingTicket,
  getBetterAuthSecret,
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  getUserOnboardingState,
  extractEffectivePermissions,
  recordSecurityAuditLog,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";

type OAuthResolvedUser = Prisma.UserGetPayload<{
  include: {
    organizations: {
      include: {
        organization: true;
      };
    };
    branchRoles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true;
              };
            };
          };
        };
        branch: true;
      };
    };
  };
}>;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } },
): Promise<NextResponse> {
  const resolvedParams = await context.params;
  const provider = resolvedParams.provider?.toLowerCase().trim();
  const origin = request.nextUrl.origin;

  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Helper to create redirect response with cleared CSRF cookie
  const createCleanRedirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 302);
    response.cookies.set({
      name: "oauth_state",
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: isProduction,
    });
    return response;
  };

  // 1. Intercept provider errors / user cancellation
  if (error) {
    return createCleanRedirect("/login?error=oauth_cancelled");
  }

  // 2. Validate CSRF state nonce from cookie
  const cookieState = request.cookies.get("oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    console.error(`[OAuth Error: State Mismatch] provider=${provider}`, { state, cookieState });
    return createCleanRedirect("/login?error=oauth_failed");
  }

  // 3. Verify authorization code is present
  if (!code) {
    console.error(`[OAuth Error: Missing Code] provider=${provider}`, { searchParams: Object.fromEntries(searchParams.entries()) });
    return createCleanRedirect("/login?error=oauth_failed");
  }

  try {
    // 4. Exchange authorization code for tokens & profile
    const redirectUri = `${origin}/api/auth/callback/${provider}`;
    const exchangeResult = await exchangeOAuthCode({
      provider,
      code,
      redirectUri,
    });

    const { tokens, profile } = exchangeResult;
    const normalizedEmail = profile.email.toLowerCase().trim();

    // 5. Query existing Account and User
    const existingAccount = await prisma.account.findUnique({
      where: {
        providerId_accountId: {
          providerId: provider,
          accountId: profile.id,
        },
      },
      include: {
        user: {
          include: {
            organizations: {
              orderBy: { createdAt: "asc" },
              include: { organization: true },
            },
            branchRoles: {
              orderBy: { createdAt: "asc" },
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true },
                    },
                  },
                },
                branch: true,
              },
            },
          },
        },
      },
    });

    let dbUser: OAuthResolvedUser;

    if (existingAccount) {
      // Existing OAuth account: update tokens
      dbUser = existingAccount.user;
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? existingAccount.refreshToken,
          idToken: tokens.idToken ?? existingAccount.idToken,
          scope: tokens.scope ?? existingAccount.scope,
          accessTokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : existingAccount.accessTokenExpiresAt,
        },
      });
    } else {
      // Check if User already exists under this email (Account Collision)
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { accounts: true },
      });

      if (existingUser) {
        // Collision detected: issue signed 5-minute ticket and redirect to password verification
        const ticket = createAccountLinkingTicket({
          email: normalizedEmail,
          providerId: provider,
          accountId: profile.id,
          name: profile.name,
          image: profile.image ?? undefined,
          secretKey: getBetterAuthSecret(),
        });

        return createCleanRedirect(`/link-account?ticket=${encodeURIComponent(ticket)}`);
      }

      // Auto-provision brand new user & account in transaction
      dbUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: profile.name || normalizedEmail.split("@")[0] || "User",
            image: profile.image ?? null,
            emailVerified: profile.emailVerified ?? true,
            metadata: {
              onboarding_status: "IN_PROGRESS",
              current_onboarding_step: 1,
            },
          },
        });

        await tx.account.create({
          data: {
            userId: user.id,
            providerId: provider,
            accountId: profile.id,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            idToken: tokens.idToken,
            scope: tokens.scope,
            accessTokenExpiresAt: tokens.expiresIn
              ? new Date(Date.now() + tokens.expiresIn * 1000)
              : undefined,
          },
        });

        return {
          ...user,
          organizations: [],
          branchRoles: [],
        } as unknown as OAuthResolvedUser;
      });
    }

    // 6. Resolve lifecycle, onboarding, and workspace destination
    const { onboardingStatus, currentOnboardingStep } = getUserOnboardingState(
      dbUser.metadata,
    );

    const userPermissions = dbUser.branchRoles
      ? extractEffectivePermissions(dbUser.branchRoles)
      : [];

    const organization = dbUser.organizations?.[0]?.organization;
    const branchRole = dbUser.branchRoles?.[0];
    const roleName = branchRole?.role?.name || "Member";
    const branch = branchRole?.branch;

    const hasMultipleWorkspaces =
      onboardingStatus === "COMPLETED" && (dbUser.organizations?.length ?? 0) > 1;

    const redirectPath = hasMultipleWorkspaces
      ? "/choose-tenant"
      : resolvePostLoginRoute({
          permissions: userPermissions,
          onboardingStatus,
          currentOnboardingStep,
        });

    // 7. Generate cryptographically signed session token
    const rawPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      organizationId: organization?.id,
      organizationName: organization?.name,
      role: roleName,
      permissions: userPermissions,
      userName: dbUser.name,
      activeBranchId: branch?.id,
      activeBranchName: branch?.name,
      themePreference: "system",
      timestamp: Date.now(),
      onboardingStatus,
      currentOnboardingStep,
    });

    const token = await signSessionToken(rawPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = createCleanRedirect(redirectPath);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    // 8. Record security audit log
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      ipAddress: clientIp,
      userAgent,
      metadata: { method: `oauth_${provider}` },
    });

    return response;
  } catch (err) {
    console.error(`[OAuth Callback Exception] provider=${provider}:`, err);
    return createCleanRedirect("/login?error=oauth_failed");
  }
}
