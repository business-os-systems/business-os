import { z } from "zod";
import { readAuthProblem } from "@/components/auth/shared/problem-details";
import { readJsonBody } from "@/components/auth/shared/read-json-body";
import {
  requestTenantSwitch,
  type TenantSwitchOutcome,
} from "@/lib/tenant-switch";

/**
 * Typed boundary for the workspace chooser. The page previously read an
 * untyped tenant list and cascaded through data.tenants || [] (P3/P10).
 */

const TENANTS_ENDPOINT = "/api/v1/auth/tenants";
const LOAD_FAILURE_MESSAGE = "Failed to load your workspaces. Please try again.";
const UNEXPECTED_ERROR_MESSAGE = "An unexpected error occurred.";
const TENANT_SWITCH_FAILURE_MESSAGE = "Failed to select workspace.";

const tenantSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  role: z.string().min(1),
  logoUrl: z.string().min(1).nullable(),
});

const tenantsResponseSchema = z.object({
  tenants: z.array(tenantSchema),
});

export type TenantCardItem = z.infer<typeof tenantSchema>;

export type TenantLoadOutcome =
  | { readonly kind: "loaded"; readonly tenants: TenantCardItem[] }
  | { readonly kind: "failed"; readonly message: string };

export function mapTenantsResponse(
  response: Pick<Response, "ok" | "status">,
  body: unknown
): TenantLoadOutcome {
  if (!response.ok) {
    const detail = readAuthProblem(body)?.detail ?? null;
    return { kind: "failed", message: detail ?? LOAD_FAILURE_MESSAGE };
  }

  const parsed = tenantsResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "failed", message: LOAD_FAILURE_MESSAGE };
  }
  return { kind: "loaded", tenants: parsed.data.tenants };
}

export async function loadTenants(): Promise<TenantLoadOutcome> {
  try {
    const response = await fetch(TENANTS_ENDPOINT);
    const body = await readJsonBody(response);
    return mapTenantsResponse(response, body);
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE,
    };
  }
}

/**
 * Tenant switch with a typed failure outcome, so the chooser never keeps a
 * rejected promise (P9/P12).
 */
export async function requestTenantSwitchOutcome(
  organizationId: string
): Promise<TenantSwitchOutcome> {
  try {
    return await requestTenantSwitch(organizationId);
  } catch (error) {
    console.error("[ChooseTenant] Workspace switch request failed:", error);
    return {
      ok: false,
      redirectUrl: "/dashboard",
      errorMessage:
        error instanceof Error ? error.message : TENANT_SWITCH_FAILURE_MESSAGE,
    };
  }
}