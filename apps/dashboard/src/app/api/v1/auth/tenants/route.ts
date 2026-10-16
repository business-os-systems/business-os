import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { listUserTenants } from "@suite/auth";
import { getAuthenticatedSession } from "@/lib/session-helper";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const payload = sessionResult.session;

    const tenants = await listUserTenants(payload.userId, prisma);

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error("Error listing user tenants:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while listing workspaces.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}
