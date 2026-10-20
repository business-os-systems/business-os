import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  auditEventPayloadSchema,
  createSuccessResponseSchema,
  managerOverrideRequestSchema,
  paginationQuerySchema,
  problemDetailsSchema,
  ssoProviderSchema,
} from "../src/index.js";

describe("@suite/core - Zod Shared Contract Schemas", () => {
  describe("Pagination Schemas", () => {
    it("parses pagination queries with sensible defaults and coercion", () => {
      const parsedDefault = paginationQuerySchema.parse({});
      expect(parsedDefault.page).toBe(1);
      expect(parsedDefault.limit).toBe(20);
      expect(parsedDefault.sortDirection).toBe("desc");

      const parsedExplicit = paginationQuerySchema.parse({
        page: "3",
        limit: "50",
        sortBy: "createdAt",
        sortDirection: "asc",
      });
      expect(parsedExplicit.page).toBe(3);
      expect(parsedExplicit.limit).toBe(50);
      expect(parsedExplicit.sortBy).toBe("createdAt");
      expect(parsedExplicit.sortDirection).toBe("asc");
    });

    it("rejects invalid pagination limits", () => {
      expect(() => paginationQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => paginationQuerySchema.parse({ limit: 200 })).toThrow(); // max 100
      expect(() => paginationQuerySchema.parse({ page: -1 })).toThrow();
    });
  });

  describe("API Envelopes", () => {
    it("validates RFC 7807 problem details schema", () => {
      const validProblem = {
        type: "/errors/not-found",
        title: "Not Found",
        status: 404,
        detail: "The entity was not found",
        code: "NOT_FOUND",
        timestamp: new Date().toISOString(),
      };

      const result = problemDetailsSchema.safeParse(validProblem);
      expect(result.success).toBe(true);
    });

    it("creates type-safe success response schema", () => {
      const userSchema = z.object({ id: z.string(), name: z.string() });
      const responseSchema = createSuccessResponseSchema(userSchema);

      const validResponse = {
        success: true as const,
        data: { id: "usr_1", name: "Rohit Bahuguna" },
        requestId: "req_9988",
        timestamp: new Date().toISOString(),
      };

      const result = responseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });

  describe("SSO Provider Schemas", () => {
    it("validates google_workspace provider configuration", () => {
      const google = {
        provider: "google_workspace",
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
        hostedDomain: "riverview.com",
      };
      expect(ssoProviderSchema.safeParse(google).success).toBe(true);
    });

    it("validates microsoft_entra provider configuration", () => {
      const entra = {
        provider: "microsoft_entra",
        tenantId: "azure-tenant-id",
        clientId: "azure-client-id",
        clientSecret: "azure-client-secret",
      };
      expect(ssoProviderSchema.safeParse(entra).success).toBe(true);
    });

    it("validates saml provider configuration with URL endpoint", () => {
      const saml = {
        provider: "saml",
        entryPoint: "https://idp.example.com/sso",
        issuer: "https://business-os.com",
        cert: "MIICXAIBAAKCAQEA...",
      };
      expect(ssoProviderSchema.safeParse(saml).success).toBe(true);
    });
  });

  describe("Audit Event & Manager Override Schemas", () => {
    it("validates cryptographic SHA-256 audit event payload", () => {
      const validEvent = {
        id: "a0000000-0000-0000-0000-000000000001",
        organizationId: "org_riverview",
        branchId: "branch_south",
        actorUserId: "usr_rohit",
        action: "folio:charge:void",
        entityName: "FolioCharge",
        entityId: "fc_99",
        newData: { voidReason: "Cashier keying error" },
        prevHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        recordHash: "f4b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        timestamp: new Date().toISOString(),
      };

      expect(auditEventPayloadSchema.safeParse(validEvent).success).toBe(true);
    });

    it("rejects audit event with invalid recordHash length or format", () => {
      const invalidEvent = {
        id: "a0000000-0000-0000-0000-000000000001",
        organizationId: "org_riverview",
        actorUserId: "usr_rohit",
        action: "test",
        entityName: "Entity",
        entityId: "e_1",
        prevHash: "GENESIS",
        recordHash: "invalid_not_64_hex",
        timestamp: new Date().toISOString(),
      };

      expect(auditEventPayloadSchema.safeParse(invalidEvent).success).toBe(false);
    });

    it("validates manager override PIN requests", () => {
      const validRequest = {
        managerPin: "1234",
        action: "POS_BILL_VOID",
        entityId: "bill_501",
        branchId: "branch_south",
        reason: "Customer canceled order before kitchen prep",
      };
      expect(managerOverrideRequestSchema.safeParse(validRequest).success).toBe(true);
    });

    it("rejects manager override with non-numeric or too short PIN", () => {
      const invalidPin = {
        managerPin: "abc",
        action: "POS_BILL_VOID",
        entityId: "bill_501",
        branchId: "branch_south",
        reason: "Valid reason",
      };
      expect(managerOverrideRequestSchema.safeParse(invalidPin).success).toBe(false);
    });
  });
});
