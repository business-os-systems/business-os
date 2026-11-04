import { PLATFORM_API_PATHS, platformFetch, readProblem } from "./api";

export type SignOutOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Revokes the control session. A failed or unreachable logout must never be
 * reported as success, otherwise the browser looks signed out while the server
 * session stays valid.
 */
export async function requestPlatformSignOut(): Promise<SignOutOutcome> {
  try {
    const response = await platformFetch(PLATFORM_API_PATHS.logout, {
      method: "POST",
    });
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, message: await readProblem(response) };
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Unable to reach the platform API",
    };
  }
}
