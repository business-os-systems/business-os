import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateUserPreferences,
  type UpdateUserPreferencesResult,
} from "../../src/services/user-preferences.service";

const dbMocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));

const USER_ID = "usr_preferences";

function primeUser(metadata: unknown): void {
  dbMocks.prisma.user.findUnique.mockResolvedValue({ id: USER_ID, metadata });
  dbMocks.prisma.user.update.mockResolvedValue({ id: USER_ID });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateUserPreferences", () => {
  it("returns not_found when the user does not exist", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue(null);

    const result: UpdateUserPreferencesResult = await updateUserPreferences({ userId: USER_ID });

    expect(result).toEqual({ status: "not_found" });
    expect(dbMocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("merges a theme change into existing metadata and keeps stored defaults", async () => {
    primeUser({ theme_preference: "dark", session_timeout_seconds: 900 });

    const result = await updateUserPreferences({ userId: USER_ID, theme: "light" });

    expect(result).toEqual({
      status: "updated",
      preferences: { theme: "light", sessionTimeoutSeconds: 900 },
    });
    expect(dbMocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { metadata: { theme_preference: "light", session_timeout_seconds: 900 } },
    });
  });

  it("merges a timeout change and keeps the stored theme", async () => {
    primeUser({ theme_preference: "dark", session_timeout_seconds: 900 });

    const result = await updateUserPreferences({ userId: USER_ID, sessionTimeoutSeconds: 1200 });

    expect(result).toEqual({
      status: "updated",
      preferences: { theme: "dark", sessionTimeoutSeconds: 1200 },
    });
  });

  it("falls back to platform defaults when metadata is not an object", async () => {
    primeUser(null);

    const result = await updateUserPreferences({ userId: USER_ID });

    expect(result).toEqual({
      status: "updated",
      preferences: { theme: "system", sessionTimeoutSeconds: 86400 },
    });
    expect(dbMocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { metadata: {} },
    });
  });

  it("ignores an array metadata value instead of treating it as a record", async () => {
    primeUser(["unexpected"]);

    const result = await updateUserPreferences({ userId: USER_ID });

    expect(result).toEqual({
      status: "updated",
      preferences: { theme: "system", sessionTimeoutSeconds: 86400 },
    });
  });

  it("ignores metadata entries whose types do not match the preference", async () => {
    primeUser({ theme_preference: 42, session_timeout_seconds: "1200" });

    const result = await updateUserPreferences({ userId: USER_ID });

    expect(result).toEqual({
      status: "updated",
      preferences: { theme: "system", sessionTimeoutSeconds: 86400 },
    });
  });
});
