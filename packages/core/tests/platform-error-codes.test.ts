import { describe, expect, it } from "vitest";
import {
  PLATFORM_ERROR_CODES,
  getPlatformErrorDefinition,
  isPlatformErrorCode,
  problemTypeForErrorCode,
} from "../src/index.js";

describe("@suite/core - Platform error-code registry", () => {
  it("maps every code to a deterministic relative RFC 7807 type URI", () => {
    for (const [code, definition] of Object.entries(PLATFORM_ERROR_CODES)) {
      expect(definition.slug).toBe(
        `/errors/${code.toLowerCase().replace(/_/g, "-")}`
      );
      expect(definition.slug.startsWith("/errors/")).toBe(true);
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.status).toBeLessThanOrEqual(599);
      expect(definition.title.length).toBeGreaterThan(0);
    }
  });

  it("recognizes registered codes and rejects unknown codes", () => {
    expect(isPlatformErrorCode("CAPABILITY_DENIED")).toBe(true);
    expect(isPlatformErrorCode("NOT_A_CODE")).toBe(false);
  });

  it("returns the definition and type for a code", () => {
    expect(getPlatformErrorDefinition("TENANT_NOT_FOUND").status).toBe(404);
    expect(problemTypeForErrorCode("TENANT_NOT_FOUND")).toBe(
      "/errors/tenant-not-found"
    );
  });
});
