import { prisma } from "@suite/db";

const DEFAULT_THEME = "system";
const DEFAULT_SESSION_TIMEOUT_SECONDS = 86400;

export interface UserPreferencesDto {
  readonly theme: string;
  readonly sessionTimeoutSeconds: number;
}

export type UpdateUserPreferencesResult =
  | { readonly status: "not_found" }
  | { readonly status: "updated"; readonly preferences: UserPreferencesDto };

function readMetadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

export async function updateUserPreferences(input: {
  readonly userId: string;
  readonly theme?: string;
  readonly sessionTimeoutSeconds?: number;
}): Promise<UpdateUserPreferencesResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, metadata: true },
  });
  if (!user) {
    return { status: "not_found" };
  }

  const currentMetadata = readMetadataRecord(user.metadata);
  const updatedMetadata = {
    ...currentMetadata,
    ...(input.theme !== undefined ? { theme_preference: input.theme } : {}),
    ...(input.sessionTimeoutSeconds !== undefined
      ? { session_timeout_seconds: input.sessionTimeoutSeconds }
      : {}),
  };

  await prisma.user.update({
    where: { id: user.id },
    data: { metadata: updatedMetadata },
  });

  return {
    status: "updated",
    preferences: {
      theme:
        input.theme ??
        readMetadataString(currentMetadata, "theme_preference") ??
        DEFAULT_THEME,
      sessionTimeoutSeconds:
        input.sessionTimeoutSeconds ??
        readMetadataNumber(currentMetadata, "session_timeout_seconds") ??
        DEFAULT_SESSION_TIMEOUT_SECONDS,
    },
  };
}
