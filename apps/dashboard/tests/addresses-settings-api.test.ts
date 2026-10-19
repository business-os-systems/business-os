import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as listAddressesRoute, POST as createAddressRoute } from "../src/app/api/v1/settings/addresses/route";
import {
  GET as getAddressRoute,
  PATCH as updateAddressRoute,
  DELETE as deleteAddressRoute,
} from "../src/app/api/v1/settings/addresses/[id]/route";
import {
  signSessionToken,
  encodeSessionPayload,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@suite/auth";
import { PERMISSIONS } from "@suite/core";
import { prisma } from "@suite/db";

// Mock @suite/db prisma client
vi.mock("@suite/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/db")>();
  const mockPrisma = {
    address: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  return {
    ...actual,
    prisma: mockPrisma,
  };
});

describe("Operational Addresses Directory & Management API (Issue #163)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  const baseSession: SessionPayload = {
    userId: "usr_owner_1",
    email: "owner@company.com",
    userName: "Owner Alice",
    organizationId: "org_riverview",
    organizationName: "River View Hospitality",
    timestamp: Date.now(),
    permissions: [
      PERMISSIONS.CORE.ORGANIZATION_READ,
      PERMISSIONS.CORE.ORGANIZATION_UPDATE,
      PERMISSIONS.CORE.BRANCHES_READ,
      PERMISSIONS.CORE.BRANCHES_WRITE,
    ],
  };

  const mockRawAddress = {
    id: "addr_test_1",
    organizationId: "org_riverview",
    streetAddress: "Club House Road, Old Manali",
    landmark: "Near Hadimba Temple",
    city: "Manali",
    state: "Himachal Pradesh",
    postalCode: "175131",
    country: "IN",
    latitude: 32.2396,
    longitude: 77.1887,
    googlePlaceId: "ChIJ123456789",
    mapUrl: "https://maps.google.com/?q=32.2396,77.1887",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    branches: [],
    organizations: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.address.findMany).mockResolvedValue([mockRawAddress] as never);
    vi.mocked(prisma.address.findFirst).mockResolvedValue(mockRawAddress as never);
    vi.mocked(prisma.address.create).mockResolvedValue(mockRawAddress as never);
    vi.mocked(prisma.address.update).mockResolvedValue(mockRawAddress as never);
    vi.mocked(prisma.address.delete).mockResolvedValue(mockRawAddress as never);
  });

  async function createSignedRequest(
    url: string,
    options: {
      method?: string;
      body?: unknown;
      session?: SessionPayload | null;
    } = {}
  ): Promise<NextRequest> {
    const { method = "GET", body, session } = options;
    const headers = new Headers();

    if (session) {
      const token = await signSessionToken(encodeSessionPayload(session));
      headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
    }

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      return new NextRequest(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });
    }

    return new NextRequest(url, { method, headers });
  }

  describe("GET /api/v1/settings/addresses", () => {
    it("returns 401 UNAUTHORIZED when session cookie is missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        { session: null }
      );
      const res = await listAddressesRoute(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
      expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    });

    it("returns 403 FORBIDDEN when user lacks organization/branch read permission", async () => {
      const unprivilegedSession: SessionPayload = {
        ...baseSession,
        permissions: ["some:other:permission"],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        { session: unprivilegedSession }
      );
      const res = await listAddressesRoute(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
      expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    });

    it("returns 200 with addresses list for authorized user", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        { session: baseSession }
      );
      const res = await listAddressesRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.length).toBe(1);
      expect(json.data[0].streetAddress).toBe("Club House Road, Old Manali");
      expect(json.data[0].city).toBe("Manali");
      expect(json.data[0].isDeletable).toBe(true);
    });
  });

  describe("POST /api/v1/settings/addresses", () => {
    it("returns 403 FORBIDDEN when user lacks write permission", async () => {
      const readOnlySession: SessionPayload = {
        ...baseSession,
        permissions: [PERMISSIONS.CORE.ORGANIZATION_READ],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        {
          method: "POST",
          session: readOnlySession,
          body: {
            streetAddress: "Mall Road",
            city: "Shimla",
            state: "Himachal Pradesh",
            postalCode: "171001",
          },
        }
      );
      const res = await createAddressRoute(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });

    it("returns 400 validation error when required fields are missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        {
          method: "POST",
          session: baseSession,
          body: {
            // Missing streetAddress, city, state, postalCode
            country: "IN",
          },
        }
      );
      const res = await createAddressRoute(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.errors).toBeDefined();
      expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    });

    it("returns 201 with created address on valid urban input", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        {
          method: "POST",
          session: baseSession,
          body: {
            addressType: "URBAN",
            streetAddress: "Club House Road, Old Manali",
            landmark: "Near Hadimba Temple",
            city: "Manali",
            state: "Himachal Pradesh",
            postalCode: "175131",
            country: "IN",
            latitude: 32.2396,
            longitude: 77.1887,
          },
        }
      );
      const res = await createAddressRoute(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.city).toBe("Manali");
      expect(prisma.address.create).toHaveBeenCalledTimes(1);
    });

    it("returns 201 with created address on valid rural input", async () => {
      const mockRuralAddress = {
        id: "addr_rural_1",
        organizationId: "org_riverview",
        addressType: "RURAL",
        streetAddress: null,
        landmark: "Near Panchayat Bhavan",
        city: null,
        village: "Prini",
        postOffice: "Jagatsukh",
        district: "Kullu",
        state: "Himachal Pradesh",
        postalCode: "175143",
        country: "IN",
        latitude: null,
        longitude: null,
        googlePlaceId: null,
        mapUrl: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        branches: [],
        organizations: [],
      };
      vi.mocked(prisma.address.create).mockResolvedValueOnce(mockRuralAddress as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        {
          method: "POST",
          session: baseSession,
          body: {
            addressType: "RURAL",
            village: "Prini",
            postOffice: "Jagatsukh",
            district: "Kullu",
            landmark: "Near Panchayat Bhavan",
            state: "Himachal Pradesh",
            postalCode: "175143",
            country: "IN",
          },
        }
      );
      const res = await createAddressRoute(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.addressType).toBe("RURAL");
      expect(json.data.village).toBe("Prini");
      expect(json.data.postOffice).toBe("Jagatsukh");
      expect(json.data.district).toBe("Kullu");
      expect(json.data.formattedAddress).toContain("Prini, PO: Jagatsukh, Dist: Kullu");
    });

    it("returns 400 when rural address is missing mandatory village or postOffice", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses",
        {
          method: "POST",
          session: baseSession,
          body: {
            addressType: "RURAL",
            district: "Kullu",
            state: "Himachal Pradesh",
            postalCode: "175143",
          },
        }
      );
      const res = await createAddressRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/settings/addresses/[id]", () => {
    it("returns 404 when address is not found in organization", async () => {
      vi.mocked(prisma.address.findFirst).mockResolvedValue(null);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_missing",
        { session: baseSession }
      );
      const res = await getAddressRoute(req, {
        params: Promise.resolve({ id: "addr_missing" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("ADDRESS_NOT_FOUND");
    });

    it("returns 200 with address details when found", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_test_1",
        { session: baseSession }
      );
      const res = await getAddressRoute(req, {
        params: Promise.resolve({ id: "addr_test_1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe("addr_test_1");
    });
  });

  describe("PATCH /api/v1/settings/addresses/[id]", () => {
    it("updates address and returns 200", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_test_1",
        {
          method: "PATCH",
          session: baseSession,
          body: {
            city: "Old Manali",
          },
        }
      );
      const res = await updateAddressRoute(req, {
        params: Promise.resolve({ id: "addr_test_1" }),
      });

      expect(res.status).toBe(200);
      expect(prisma.address.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/v1/settings/addresses/[id]", () => {
    it("returns 409 Conflict when address is linked to an organization profile", async () => {
      // Mock address with organization link
      const linkedAddress = {
        ...mockRawAddress,
        organizations: [{ id: "org_riverview", name: "River View Hospitality" }],
      };
      vi.mocked(prisma.address.findFirst).mockResolvedValue(linkedAddress as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_test_1",
        {
          method: "DELETE",
          session: baseSession,
        }
      );
      const res = await deleteAddressRoute(req, {
        params: Promise.resolve({ id: "addr_test_1" }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("ADDRESS_IN_USE");
      expect(data.inUseReason).toContain("Organization Legal HQ");
      expect(prisma.address.delete).not.toHaveBeenCalled();
    });

    it("returns 409 Conflict when address is linked to a branch", async () => {
      // Mock address with branch link
      const linkedBranchAddress = {
        ...mockRawAddress,
        branches: [{ id: "br_1", name: "River View Manali", code: "MANALI-01" }],
      };
      vi.mocked(prisma.address.findFirst).mockResolvedValue(linkedBranchAddress as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_test_1",
        {
          method: "DELETE",
          session: baseSession,
        }
      );
      const res = await deleteAddressRoute(req, {
        params: Promise.resolve({ id: "addr_test_1" }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("ADDRESS_IN_USE");
      expect(data.inUseReason).toContain("MANALI-01");
      expect(prisma.address.delete).not.toHaveBeenCalled();
    });

    it("deletes address and returns 200 when address is unlinked", async () => {
      vi.mocked(prisma.address.findFirst).mockResolvedValue(mockRawAddress as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/addresses/addr_test_1",
        {
          method: "DELETE",
          session: baseSession,
        }
      );
      const res = await deleteAddressRoute(req, {
        params: Promise.resolve({ id: "addr_test_1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: "addr_test_1" },
      });
    });
  });
});
