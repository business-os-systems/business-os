import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { listUserTenants } from "@suite/auth";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
} from "@/lib/auth-constants";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session required to list workspace memberships.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/invalid-session",
          title: "Invalid Session",
          status: 401,
          detail: "Session token signature is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const payload = decodeSessionPayload(sessionCookie);
    if (!payload?.userId) {
      return NextResponse.json(
        {
          type: "/errors/invalid-payload",
          title: "Invalid Session Payload",
          status: 401,
          detail: "Session token is malformed.",
          code: "INVALID_PAYLOAD",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

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
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
