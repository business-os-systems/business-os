import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { getAuthenticatedSession } from "@/lib/session-helper";

const PreferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  sessionTimeoutSeconds: z
    .number()
    .int()
    .min(300, "Minimum session timeout is 300 seconds (5 minutes)")
    .max(2592000, "Maximum session timeout is 30 days")
    .optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const payload = sessionResult.session;


    const rawBody = await request.json().catch(() => ({}));
    const parseResult = PreferencesSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Validation Failed",
          status: 400,
          detail: parseResult.error.issues[0]?.message ?? "Invalid preferences payload.",
          code: "VALIDATION_FAILED",
          errors: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { theme, sessionTimeoutSeconds } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, metadata: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          type: "/errors/user-not-found",
          title: "User Not Found",
          status: 404,
          detail: "User record associated with session does not exist.",
          code: "USER_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const currentMetadata = (user.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...currentMetadata,
      ...(theme !== undefined ? { theme_preference: theme } : {}),
      ...(sessionTimeoutSeconds !== undefined ? { session_timeout_seconds: sessionTimeoutSeconds } : {}),
    };

    await prisma.user.update({
      where: { id: user.id },
      data: { metadata: updatedMetadata },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        theme: theme ?? currentMetadata.theme_preference ?? "system",
        sessionTimeoutSeconds:
          sessionTimeoutSeconds ?? currentMetadata.session_timeout_seconds ?? 86400,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "An unexpected error occurred.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
