import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDEMPOTENCY_HEADER } from "../src/lib/api";
import {
  fetchAppSettingsDefaults,
  updateAppSettingsDefaults,
} from "../src/lib/app-settings-defaults-api";

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });

const APP_ID = "website-builder";

const VIEW = {
  appId: APP_ID,
  schema: { fields: [] },
  values: {},
  effectiveValues: {},
  sources: {},
  staleFields: [],
  version: "0",
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("application settings defaults API client", () => {
  it("reads the defaults envelope", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: VIEW }));
    await expect(fetchAppSettingsDefaults(APP_ID)).resolves.toEqual(
      VIEW,
    );
  });

  it("sends a versioned, idempotent update", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { data: { ...VIEW, version: "1", removedFields: [] } }),
    );
    await updateAppSettingsDefaults({
      appId: APP_ID,
      values: { customDomainEnabled: true },
      expectedVersion: "0",
      idempotencyKey: "key-1",
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(call[0]).toBe(
      "http://api.test/api/v1/admin/apps/website-builder/settings",
    );
    expect(call[1]?.method).toBe("PATCH");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toBe("key-1");
    if (typeof call[1]?.body !== "string") {
      throw new Error("The request body was not JSON text");
    }
    expect(JSON.parse(call[1].body)).toEqual({
      values: { customDomainEnabled: true },
      expectedVersion: "0",
    });
  });
});

describe("application settings defaults API client errors", () => {
  it("maps a problem response from the update to a typed error", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(409, {
        type: "/errors/version-conflict",
        title: "Resource Conflict",
        status: 409,
        detail: "The defaults changed.",
        code: "VERSION_CONFLICT",
      }),
    );
    await expect(
      updateAppSettingsDefaults({
        appId: APP_ID,
        values: {},
        expectedVersion: "0",
        idempotencyKey: "key-2",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps a problem response to a typed error", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail: "Capability denied.",
        code: "CAPABILITY_DENIED",
      }),
    );
    await expect(
      fetchAppSettingsDefaults(APP_ID),
    ).rejects.toMatchObject({ status: 403 });
  });
});
