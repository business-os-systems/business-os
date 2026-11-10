import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadPlatformTestEnv } from "./helpers/platform-env.js";

loadPlatformTestEnv();

const ORIGINAL = {
  enforced: process.env.EDGE_ADMISSION_ENFORCED,
  teamDomain: process.env.EDGE_TEAM_DOMAIN,
  audience: process.env.EDGE_AUDIENCE,
};

afterEach(() => {
  process.env.EDGE_ADMISSION_ENFORCED = ORIGINAL.enforced;
  process.env.EDGE_TEAM_DOMAIN = ORIGINAL.teamDomain;
  process.env.EDGE_AUDIENCE = ORIGINAL.audience;
});

describe("admin edge admission mount (FR-069)", () => {
  it("rejects an admin request without the Cloudflare assertion when enforced", async () => {
    process.env.EDGE_ADMISSION_ENFORCED = "true";
    process.env.EDGE_TEAM_DOMAIN = "team.cloudflareaccess.com";
    process.env.EDGE_AUDIENCE = "platform-audience";
    const app = createApp();

    const response = await app.request("/api/v1/admin/flags");

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("ADMISSION_DENIED");
  });

  it("does not gate public health traffic", async () => {
    process.env.EDGE_ADMISSION_ENFORCED = "true";
    process.env.EDGE_TEAM_DOMAIN = "team.cloudflareaccess.com";
    process.env.EDGE_AUDIENCE = "platform-audience";
    const app = createApp();

    const response = await app.request("/health/live");

    expect(response.status).toBe(200);
  });

  it("leaves the admin surface reachable in development when not enforced", async () => {
    process.env.EDGE_ADMISSION_ENFORCED = undefined;
    const app = createApp();

    const response = await app.request("/api/v1/admin/flags", {
      headers: { Origin: process.env.CONTROL_PLANE_ORIGIN ?? "" },
    });

    expect(response.status).toBe(401);
  });
});
