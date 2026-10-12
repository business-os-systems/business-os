import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, createSessionCookieOptions } from "@/lib/auth-constants";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    // Generate authenticated session token
    const token = `session_${Buffer.from(`${email}:${Date.now()}`).toString("base64")}`;
    const cookieOptions = createSessionCookieOptions(process.env.NODE_ENV === "production");

    const response = NextResponse.json({
      success: true,
      user: {
        email,
        name: (email.split("@")[0] || "ADMIN").toUpperCase(),
        role: "Platform Admin",
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
  } catch {
    return NextResponse.json(
      { error: "Failed to authenticate session" },
      { status: 500 }
    );
  }
}
