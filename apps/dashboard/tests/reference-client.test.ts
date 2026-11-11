import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CookieState {
  token: string | null;
}

const cookieState = vi.hoisted((): CookieState => ({ token: "session-token" }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (cookieState.token === null ? undefined : { value: cookieState.token }),
    }),
}));

import {
  REFERENCE_CATALOG_CACHE,
  ReferenceCatalogError,
  readBranchTypeOptions,
  readReferenceCatalogValues,
  toFormFieldOptions,
} from "../src/lib/reference-client";

const ENVELOPE = {
  success: true,
  data: {
    catalog: {
      key: "branch_type",
      label: "Branch types",
      description: null,
      values: [
        { code: "hotel", label: "Hotel / Resort", sortOrder: 0, metadata: {} },
        { code: "homestay", label: "Homestay / B&B", sortOrder: 1, metadata: {} },
      ],
    },
    asOf: "2026-11-09T06:30:00.000Z",
  },
  requestId: "req_1",
  timestamp: "2026-11-09T06:30:00.000Z",
};

const fetchMock = vi.fn<typeof fetch>();

function respondOk(): void {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(ENVELOPE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
  cookieState.token = "session-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reference client mapping", () => {
  it("maps catalog values to form options", async () => {
    respondOk();

    const options = await readBranchTypeOptions();

    expect(options).toEqual([
      { label: "Hotel / Resort", value: "hotel" },
      { label: "Homestay / B&B", value: "homestay" },
    ]);
  });

  it("never invents options the catalog did not return", () => {
    const options = toFormFieldOptions([
      { code: "cafe", label: "Cafe / Bistro", sortOrder: 0, metadata: {} },
    ]);

    expect(options).toHaveLength(1);
    expect(options.map((option) => option.value)).toEqual(["cafe"]);
  });

  it("forwards the tenant session cookie and the catalog path", async () => {
    respondOk();

    await readReferenceCatalogValues("branch_type");

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe("http://localhost:4000/api/v1/reference/catalogs/branch_type");
    expect(firstCall?.[1]?.headers).toMatchObject({
      Cookie: "__Host-bos_session=session-token",
    });
  });
});

describe("reference client failure and cache", () => {
  it("raises the RFC 7807 detail instead of an empty list", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "/errors/unknown-catalog",
          title: "Resource Not Found",
          status: 404,
          detail: "Unknown reference catalog: branch_type.",
          code: "UNKNOWN_CATALOG",
        }),
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      ),
    );

    await expect(readReferenceCatalogValues("branch_type")).rejects.toMatchObject({
      message: "Unknown reference catalog: branch_type.",
      code: "UNKNOWN_CATALOG",
    });
  });

  it("fails before any request when there is no session", async () => {
    cookieState.token = null;

    await expect(readBranchTypeOptions()).rejects.toBeInstanceOf(ReferenceCatalogError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("declares the 60-second cache contract", () => {
    expect(REFERENCE_CATALOG_CACHE.ttlSeconds).toBe(60);
    expect(REFERENCE_CATALOG_CACHE.keyPrefix).toBe("reference:catalog");
    expect(REFERENCE_CATALOG_CACHE.invalidatedBy).toContain("catalog mutation");
  });
});
