import { z } from "zod";

/**
 * One typed client for the tenant-switch endpoint. Both the chooser page and
 * the workspace switcher use it, so RFC 7807 details and redirect handling
 * cannot drift between the two entry points (P3/P9/P12).
 */

export interface TenantSwitchOutcome {
  readonly ok: boolean;
  readonly redirectUrl: string;
  readonly errorMessage: string | null;
}

const switchSuccessSchema = z.object({
  redirectUrl: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//"),
      "The redirect URL must be an internal path."
    ),
});

const problemSchema = z.object({
  detail: z.string().min(1).optional(),
});

export async function requestTenantSwitch(
  organizationId: string
): Promise<TenantSwitchOutcome> {
  const response = await fetch("/api/v1/auth/switch-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const payload = await readJsonBody(response);

  if (!response.ok) {
    const problem = problemSchema.safeParse(payload);
    return {
      ok: false,
      redirectUrl: "/dashboard",
      errorMessage:
        problem.success && problem.data.detail !== undefined
          ? problem.data.detail
          : `Workspace switch failed with status ${response.status}.`,
    };
  }

  const success = switchSuccessSchema.safeParse(payload);
  if (!success.success) {
    return {
      ok: false,
      redirectUrl: "/dashboard",
      errorMessage: "The workspace switch response was invalid. Reload and try again.",
    };
  }

  return {
    ok: true,
    redirectUrl: success.data.redirectUrl,
    errorMessage: null,
  };
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
