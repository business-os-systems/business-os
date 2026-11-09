import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { listUserWorkspaces } from "@/services/session-context.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const tenants = await listUserWorkspaces(sessionResult.session.userId);
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
