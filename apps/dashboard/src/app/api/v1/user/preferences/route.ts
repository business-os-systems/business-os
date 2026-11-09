import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, zodProblemResponse } from "@/lib/problem-response";
import { updateUserPreferences } from "@/services/user-preferences.service";

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

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = PreferencesSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message ?? "Invalid preferences payload.",
        code: "VALIDATION_FAILED",
      });
    }

    const result = await updateUserPreferences({
      userId: sessionResult.session.userId,
      theme: parseResult.data.theme,
      sessionTimeoutSeconds: parseResult.data.sessionTimeoutSeconds,
    });

    if (result.status === "not_found") {
      return problemResponse({
        type: "/errors/user-not-found",
        title: "User Not Found",
        status: 404,
        detail: "User record associated with session does not exist.",
        code: "USER_NOT_FOUND",
      });
    }

    return NextResponse.json({ success: true, preferences: result.preferences });
  } catch (error) {
    console.error("Error updating user preferences:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while updating user preferences.",
      code: "INTERNAL_ERROR",
    });
  }
}
