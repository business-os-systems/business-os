import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { isProduction } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (sessionToken) {
      // Invalidate and delete active server-side session from database
      await prisma.session
        .deleteMany({
          where: { token: sessionToken },
        })
        .catch(() => {
          // Gracefully continue even if session was already deleted or is stateless
        });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Logout encountered an error",
      },
      { status: 500 }
    );
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
}
