import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { isProduction } from "@/lib/env";

const LoginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(4, "Password must be at least 4 characters"),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = LoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    const { email, password: _password } = parseResult.data;

    // Verify user in PostgreSQL database
    const dbUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
        branchRoles: {
          include: {
            role: true,
            branch: true,
          },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "Invalid email or password. Please check your credentials." },
        { status: 401 }
      );
    }

    const membership = dbUser.organizations[0];
    if (!membership) {
      return NextResponse.json(
        { error: "Account is not associated with an active enterprise workspace." },
        { status: 403 }
      );
    }

    const organization = membership.organization;
    const branchRole = dbUser.branchRoles[0];
    if (!branchRole?.role) {
      return NextResponse.json(
        { error: "Account does not have an active role assigned within this organization." },
        { status: 403 }
      );
    }

    const roleName = branchRole.role.name;
    const branchName = branchRole.branch?.name ?? undefined;
    const branchId = branchRole.branchId ?? undefined;

    // Generate cryptographically signed session token with verified tenant payload
    const rawPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      organizationId: organization.id,
      organizationName: organization.name,
      role: roleName,
      userName: dbUser.name,
      activeBranchId: branchId,
      activeBranchName: branchName,
      timestamp: Date.now(),
    });

    const token = await signSessionToken(rawPayload);
    const cookieOptions = createSessionCookieOptions(isProduction);

    const response = NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleName,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to authenticate session" },
      { status: 500 }
    );
  }
}
