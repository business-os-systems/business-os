import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS, type PermissionCode } from "@suite/core";
import { prisma, type PrismaClient } from "@suite/db";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsSitesRouter } from "../../src/routes/cms/sites.js";
import {
  createPlatformOwnerTestClient,
  platformIntegrationTestsEnabled,
} from "../helpers/platform-db.js";

const RUN = Date.now().toString(36).toUpperCase();
const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL) &&
  platformIntegrationTestsEnabled();
const APP_ID = "website-builder";
const ORG = "org_wt381_settings_" + RUN;
const OPERATOR = "op_wt381_settings_" + RUN;
const SETTINGS_PATH = "/api/v1/cms/settings";

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createApp(organizationId: string, permissions: readonly PermissionCode[]) {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...permissions] });
    c.set("userId", "usr_wt381_settings");
    c.set("organizationId", organizationId);
    await next();
  });
  app.route("/api/v1/cms", createCmsSitesRouter());
  return app;
}

let ownerClient: PrismaClient | null = null;

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  ownerClient = createPlatformOwnerTestClient();
  await prisma.organization.create({
    data: { id: ORG, name: "WT381 settings", slug: "wt381-settings-" + RUN },
  });
  await prisma.installedApp.create({
    data: {
      organizationId: ORG,
      appId: APP_ID,
      isEnabled: true,
      settings: { customDomainEnabled: true, title: "snapshot" },
    },
  });
  await ownerClient.platformOperator.create({
    data: {
      id: OPERATOR,
      email: "wt381-settings-" + RUN.toLowerCase() + "@example.test",
      displayName: "WT381 settings operator",
      status: "ACTIVE",
    },
  });
  await ownerClient.appSettingsDefault.create({
    data: {
      appId: APP_ID,
      settings: { defaultLocale: "en-GB" },
      updatedBy: OPERATOR,
    },
  });
});

beforeEach(async () => {
  if (!enabled || ownerClient === null) {
    return;
  }
  await ownerClient.appSettingsDefault.upsert({
    where: { appId: APP_ID },
    create: {
      appId: APP_ID,
      settings: { defaultLocale: "en-GB" },
      updatedBy: OPERATOR,
    },
    update: { settings: { defaultLocale: "en-GB" } },
  });
});

afterAll(async () => {
  if (!enabled || ownerClient === null) {
    return;
  }
  await ownerClient.appSettingsDefault.deleteMany({ where: { appId: APP_ID } });
  await ownerClient.platformOperator.deleteMany({ where: { id: OPERATOR } });
  await ownerClient.$disconnect();
  await prisma.installedApp.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
});

describe.skipIf(!enabled)("tenant effective application settings", () => {
  it("returns the effective value and its source for every field", async () => {
    const app = createApp(ORG, [PERMISSIONS.WEBSITE_BUILDER.SITES_READ]);

    const response = await app.request(SETTINGS_PATH);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: {
        settings: {
          appId: string;
          effectiveValues: Record<string, unknown>;
          sources: Record<string, string>;
        };
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.settings.appId).toBe(APP_ID);
    expect(body.data.settings.effectiveValues).toEqual({
      customDomainEnabled: true,
      defaultLocale: "en-GB",
    });
    expect(body.data.settings.sources).toEqual({
      customDomainEnabled: "tenant",
      defaultLocale: "app",
    });
  });

  it("falls back to the schema default when neither layer has a value", async () => {
    if (ownerClient === null) {
      throw new Error("The platform owner client is required.");
    }
    await ownerClient.appSettingsDefault.deleteMany({ where: { appId: APP_ID } });
    const app = createApp(ORG, [PERMISSIONS.WEBSITE_BUILDER.SITES_READ]);

    const response = await app.request(SETTINGS_PATH);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { settings: { effectiveValues: Record<string, unknown>; sources: Record<string, string> } };
    };
    expect(body.data.settings.effectiveValues.defaultLocale).toBe("en");
    expect(body.data.settings.sources.defaultLocale).toBe("schema");
    expect(body.data.settings.sources.customDomainEnabled).toBe("tenant");
  });

  it("denies an actor without the site read capability", async () => {
    const app = createApp(ORG, []);

    const response = await app.request(SETTINGS_PATH);

    expect(response.status).toBe(403);
  });
});
