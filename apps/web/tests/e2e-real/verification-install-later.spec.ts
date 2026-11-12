import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, request as playwrightRequest } from "@playwright/test";
import { resolveLocalMailCaptureDirectory } from "@suite/auth";
import { WEBSITE_BUILDER_MANIFEST } from "@suite/website-builder";
import { dashboardOrigin } from "./helpers/journey-environment";
import {
  createRunSuffix,
  createTenantApiContext,
  prepareUnverifiedTenant,
} from "./helpers/journey-fixtures";
import { readTenantSections } from "./helpers/catalog-operator";

/**
 * Install-later, without database access (T183, N8, FR-013).
 *
 * The tenant has not verified its address and has no application installed. A
 * tester reads the verification link out of the local mail drop, confirms it,
 * and only then can install the Website Builder. Nothing here opens the
 * database: the mail drop is the whole tester-facing delivery channel.
 */

const CONFIRM_TOKEN_PATTERN = /token=([A-Za-z0-9._~-]+)/;
const VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED";
const APP_NOT_INSTALLED = "APP_NOT_INSTALLED";

interface CapturedMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCapturedMessage(value: unknown): CapturedMessage {
  if (!isRecord(value) || typeof value.to !== "string" || typeof value.html !== "string") {
    throw new Error("A captured mail file has no recipient or body.");
  }
  return {
    to: value.to,
    subject: typeof value.subject === "string" ? value.subject : "",
    html: value.html,
    text: typeof value.text === "string" ? value.text : null,
  };
}

/** Finds the newest captured message for one recipient in the local mail drop. */
async function readCapturedMail(recipient: string): Promise<CapturedMessage> {
  const directory = resolveLocalMailCaptureDirectory();
  const fileNames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const messages = (
    await Promise.all(
      fileNames.map(async (fileName) => {
        const raw = await readFile(join(directory, fileName), "utf8");
        const parsed: unknown = JSON.parse(raw);
        return readCapturedMessage(parsed);
      })
    )
  ).filter((message) => message.to === recipient);
  expect(messages.length).toBeGreaterThan(0);
  const [latest] = messages;
  if (latest === undefined) {
    throw new Error("No captured message for " + recipient + ".");
  }
  return latest;
}

test.describe("verification and install-later outside production", () => {
  test("a tester completes verification from the local mail drop, then installs the app", async () => {
    const suffix = createRunSuffix();
    const tenant = prepareUnverifiedTenant(suffix);
    const dashboardApi = await playwrightRequest.newContext({
      baseURL: dashboardOrigin(tenant.tenantHost),
      extraHTTPHeaders: { cookie: "__Host-bos_session=" + tenant.tenantSessionToken },
    });
    const tenantApi = await createTenantApiContext(tenant);

    try {
      // The installation gate holds before verification.
      const beforeInstall = await dashboardApi.post(
        "/api/v1/apps/" + WEBSITE_BUILDER_MANIFEST.appId + "/install"
      );
      expect(beforeInstall.status()).toBe(403);
      expect(await beforeInstall.text()).toContain(VERIFICATION_REQUIRED);

      const beforeCms = await dashboardApi.get("/api/v1/cms/catalog/sections");
      expect(beforeCms.status()).toBe(403);
      expect(await beforeCms.text()).toContain(APP_NOT_INSTALLED);

      // The tester asks for the link and reads it from the mail drop.
      const requested = await dashboardApi.post("/api/auth/verify-email/request", {
        data: { email: tenant.userEmail },
      });
      expect(requested.status()).toBe(200);

      const captured = await readCapturedMail(tenant.userEmail);
      const token = CONFIRM_TOKEN_PATTERN.exec(captured.text ?? captured.html)?.[1];
      expect(token).toBeDefined();
      if (token === undefined) {
        throw new Error("The captured verification mail carries no token.");
      }

      const confirmed = await dashboardApi.post("/api/auth/verify-email/confirm", {
        data: { token },
      });
      expect(confirmed.status()).toBe(200);

      // The verified tenant can install the application afterwards.
      const install = await dashboardApi.post(
        "/api/v1/apps/" + WEBSITE_BUILDER_MANIFEST.appId + "/install"
      );
      expect(install.status()).toBe(200);

      const sections = await readTenantSections(tenantApi);
      expect(Array.isArray(sections)).toBe(true);
      const afterInstall = await dashboardApi.get("/api/v1/cms/catalog/sections");
      expect(afterInstall.status()).toBe(200);
    } finally {
      await dashboardApi.dispose();
      await tenantApi.dispose();
    }
  });
});
