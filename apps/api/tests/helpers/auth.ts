import {
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@suite/auth";

// Ensure test execution environment has valid signing secrets
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET =
    "business-os-enterprise-session-signing-secret-key-32ch-min";
}

if (!process.env.METRICS_AUTH_TOKEN) {
  process.env.METRICS_AUTH_TOKEN = "metrics-secure-telemetry-token-dev";
}

export async function createTestSessionToken(
  overrides: Partial<SessionPayload> = {}
): Promise<string> {
  const payload: SessionPayload = {
    userId: "usr_test_123",
    email: "test@business-os.com",
    userName: "Test User",
    organizationId: "org_test_1",
    organizationName: "Test Org",
    timestamp: Date.now(),
    role: "owner",
    permissions: ["*"],
    ...overrides,
  };
  const encoded = encodeSessionPayload(payload);
  return await signSessionToken(encoded);
}

export async function createAuthHeaders(
  overrides: Partial<SessionPayload> = {}
): Promise<Record<string, string>> {
  const token = await createTestSessionToken(overrides);
  return {
    Authorization: `Bearer ${token}`,
  };
}
