import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { generateKeyPair, SignJWT } from "jose";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import {
  createEdgeAdmissionMiddleware,
  EDGE_ADMISSION_HEADER,
} from "../src/middleware/edge-admission.js";

const TEAM_DOMAIN = "team.cloudflareaccess.com";
const AUDIENCE = "platform-audience";

type GeneratedKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function createToken(
  privateKey: GeneratedKeyPair["privateKey"],
  overrides: { audience?: string; email?: string } = {}
): Promise<string> {
  return new SignJWT({ email: overrides.email ?? "ops@example.com" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(`https://${TEAM_DOMAIN}`)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("Platform edge admission", () => {
  it("admits a valid assertion and strips client-supplied identity headers", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await createToken(privateKey);

    const app = new Hono<{ Variables: { requestId: string; admissionEmail: string | null } }>();
    app.onError(globalErrorHandler);
    app.use(
      "*",
      createEdgeAdmissionMiddleware({
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE,
        keyResolver: async () => publicKey,
      })
    );
    app.get("/", (c) =>
      c.json({
        email: c.get("admissionEmail"),
        spoofed: c.req.header("cf-access-authenticated-user-email"),
      })
    );

    const response = await app.request("/", {
      headers: {
        [EDGE_ADMISSION_HEADER]: token,
        "cf-access-authenticated-user-email": "attacker@example.com",
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      email: string | null;
      spoofed?: string;
    };
    expect(body.email).toBe("ops@example.com");
    expect(body.spoofed).toBeUndefined();
  });

  it("rejects a request without an admission assertion", async () => {
    const { publicKey } = await generateKeyPair("RS256");
    const app = new Hono<{ Variables: { requestId: string; admissionEmail: string | null } }>();
    app.onError(globalErrorHandler);
    app.use(
      "*",
      createEdgeAdmissionMiddleware({
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE,
        keyResolver: async () => publicKey,
      })
    );
    app.get("/", (c) => c.text("ok"));

    const response = await app.request("/");
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("ADMISSION_DENIED");
  });

  it("rejects a token with the wrong audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await createToken(privateKey, { audience: "wrong" });

    const app = new Hono<{ Variables: { requestId: string; admissionEmail: string | null } }>();
    app.onError(globalErrorHandler);
    app.use(
      "*",
      createEdgeAdmissionMiddleware({
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE,
        keyResolver: async () => publicKey,
      })
    );
    app.get("/", (c) => c.text("ok"));

    const response = await app.request("/", {
      headers: { [EDGE_ADMISSION_HEADER]: token },
    });
    expect(response.status).toBe(403);
  });
});
