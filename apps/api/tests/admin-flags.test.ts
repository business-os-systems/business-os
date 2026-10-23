import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";
import { createAuthHeaders } from "./helpers/auth.js";
import type { FlagRecord } from "../src/services/admin-flags.service.js";

// ──────────────────────────────────────────────────────────
//  Shared response shapes for safe type-narrowing in tests
// ──────────────────────────────────────────────────────────

interface ApiListResponse {
  success: true;
  data: FlagRecord[];
  meta: { total: number; environment: string };
  requestId: string;
  timestamp: string;
}

interface ApiSingleResponse {
  success: true;
  data: FlagRecord;
  requestId: string;
  timestamp: string;
}

interface ApiProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId?: string;
  timestamp: string;
}

// ──────────────────────────────────────────────────────────
//  Test Fixtures
// ──────────────────────────────────────────────────────────

const SUPER_ADMIN_PERMISSIONS = ["*"];
const LIMITED_PERMISSIONS = ["core:organization:read"];
const NO_PERMISSIONS: string[] = [];

const app = createApp({ enableRateLimiting: false });

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

async function superAdminHeaders() {
  return createAuthHeaders({ permissions: SUPER_ADMIN_PERMISSIONS });
}

async function limitedUserHeaders() {
  return createAuthHeaders({ permissions: LIMITED_PERMISSIONS });
}

async function noPermHeaders() {
  return createAuthHeaders({ permissions: NO_PERMISSIONS });
}

function uniqueKey(suffix: string): string {
  return `test_flag_${Date.now()}_${suffix}`;
}

// ──────────────────────────────────────────────────────────
//  Cleanup: remove test flags created during the suite
// ──────────────────────────────────────────────────────────

let createdFlagKeys: string[] = [];

beforeEach(() => {
  vi.restoreAllMocks();
  createdFlagKeys = [];
});

afterEach(async () => {
  if (createdFlagKeys.length > 0) {
    await prisma.featureFlag.deleteMany({
      where: { key: { in: createdFlagKeys } },
    });
  }
});

// ──────────────────────────────────────────────────────────
//  Test Suite: Admin Feature Flags API
// ──────────────────────────────────────────────────────────

describe("Admin Feature Flags API [#202]", () => {
  // ────────────────────────────────────
  //  GET /api/v1/admin/flags — List
  // ────────────────────────────────────

  describe("GET /api/v1/admin/flags", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await app.request("/api/v1/admin/flags");
      expect(res.status).toBe(401);

      const body = (await res.json()) as ApiProblemDetails;
      expect(body.status).toBe(401);
      expect(body.code).toBeDefined();
    });

    it("returns 403 when authenticated user lacks super-admin capability", async () => {
      const headers = await limitedUserHeaders();
      const res = await app.request("/api/v1/admin/flags", { headers });
      expect(res.status).toBe(403);

      const body = (await res.json()) as ApiProblemDetails;
      expect(body.status).toBe(403);
      expect(body.code).toBe("ADMIN_FLAGS_FORBIDDEN");
    });

    it("returns 200 with flag list for super-admin user", async () => {
      const headers = await superAdminHeaders();
      const res = await app.request("/api/v1/admin/flags", { headers });
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiListResponse;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.meta.total).toBe("number");
      expect(body.requestId).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it("returns 200 filtered by environment query param", async () => {
      const headers = await superAdminHeaders();
      const res = await app.request("/api/v1/admin/flags?environment=staging", { headers });
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiListResponse;
      expect(body.success).toBe(true);
      // Every returned flag must belong to the requested environment
      for (const flag of body.data) {
        expect(flag.environment).toBe("staging");
      }
    });
  });

  // ────────────────────────────────────
  //  POST /api/v1/admin/flags — Create
  // ────────────────────────────────────

  describe("POST /api/v1/admin/flags", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test_flag", name: "Test Flag" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated user lacks super-admin capability", async () => {
      const headers = await noPermHeaders();
      const res = await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test_flag", name: "Test Flag" }),
      });
      expect(res.status).toBe(403);

      const body = (await res.json()) as ApiProblemDetails;
      expect(body.code).toBe("ADMIN_FLAGS_FORBIDDEN");
    });

    it("returns 201 and creates a new feature flag for super-admin", async () => {
      const key = uniqueKey("create");
      createdFlagKeys.push(key);

      const headers = await superAdminHeaders();
      const res = await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name: "Test Create Flag",
          description: "Created in integration test",
          environment: "development",
          isEnabled: true,
          defaultEnabled: false,
        }),
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as ApiSingleResponse;
      expect(body.success).toBe(true);
      expect(body.data.key).toBe(key);
      expect(body.data.name).toBe("Test Create Flag");
      expect(body.data.environment).toBe("development");
      expect(body.data.isEnabled).toBe(true);
      expect(body.data.defaultEnabled).toBe(false);
      expect(body.data.version).toBe(1);
      expect(body.data.id).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
    });

    it("returns 422 when required fields (key, name) are missing", async () => {
      const headers = await superAdminHeaders();
      const res = await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Missing key and name" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────
  //  PATCH /api/v1/admin/flags/:key — Update
  // ──────────────────────────────────────────

  describe("PATCH /api/v1/admin/flags/:key", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await app.request("/api/v1/admin/flags/some_flag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, isEnabled: false }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated user lacks super-admin capability", async () => {
      const headers = await limitedUserHeaders();
      const res = await app.request("/api/v1/admin/flags/some_flag", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, isEnabled: false }),
      });
      expect(res.status).toBe(403);
    });

    it("returns 404 when the flag key does not exist", async () => {
      const headers = await superAdminHeaders();
      const res = await app.request("/api/v1/admin/flags/nonexistent_flag_xyz_999", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, isEnabled: false }),
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as ApiProblemDetails;
      expect(body.code).toBe("FLAG_NOT_FOUND");
    });

    it("returns 409 on optimistic concurrency conflict (stale expectedVersion)", async () => {
      const key = uniqueKey("conflict");
      createdFlagKeys.push(key);

      const headers = await superAdminHeaders();
      await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key, name: "Conflict Test Flag", environment: "development" }),
      });

      // Attempt update with wrong expectedVersion (stale version 99)
      const res = await app.request(`/api/v1/admin/flags/${key}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 99, isEnabled: false }),
      });
      expect(res.status).toBe(409);

      const body = (await res.json()) as ApiProblemDetails;
      expect(body.code).toBe("FLAG_VERSION_CONFLICT");
    });

    it("returns 200 and updates flag state with correct expectedVersion", async () => {
      const key = uniqueKey("update");
      createdFlagKeys.push(key);

      const headers = await superAdminHeaders();

      // Create
      const createRes = await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key, name: "Update Test Flag", environment: "development", isEnabled: true }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as ApiSingleResponse;
      expect(created.data.version).toBe(1);

      // Update with correct expectedVersion
      const updateRes = await app.request(`/api/v1/admin/flags/${key}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          isEnabled: false,
          reason: "Disabling for integration test validation",
        }),
      });
      expect(updateRes.status).toBe(200);

      const updated = (await updateRes.json()) as ApiSingleResponse;
      expect(updated.success).toBe(true);
      expect(updated.data.key).toBe(key);
      expect(updated.data.isEnabled).toBe(false);
      expect(updated.data.version).toBe(2);
    });

    it("writes an audit log entry after a successful update", async () => {
      const key = uniqueKey("audit");
      createdFlagKeys.push(key);

      const headers = await superAdminHeaders();

      await app.request("/api/v1/admin/flags", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key, name: "Audit Log Test Flag", environment: "development" }),
      });

      await app.request(`/api/v1/admin/flags/${key}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, defaultEnabled: true, reason: "Audit test mutation" }),
      });

      const auditEntries = await prisma.featureFlagAuditLog.findMany({
        where: { flagKey: key },
        orderBy: { createdAt: "desc" },
      });

      // At minimum 2 audit entries: one for create, one for update
      expect(auditEntries.length).toBeGreaterThanOrEqual(2);

      const updateEntry = auditEntries[0];
      expect(updateEntry?.reason).toBe("Audit test mutation");
      expect(updateEntry?.source).toBe("API");
    });
  });
});
