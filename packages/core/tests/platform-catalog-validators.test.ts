import { describe, expect, it } from "vitest";
import {
  CATALOG_KEYS,
  normalizeCatalogCode,
  validateCatalogCode,
} from "../src/index.js";

describe("@suite/core - reference catalog validation", () => {
  it("normalizes and accepts ISO currency and country codes", () => {
    expect(validateCatalogCode("currency", " usd ")).toEqual({
      valid: true,
      normalized: "USD",
    });
    expect(validateCatalogCode("country", "in")).toEqual({
      valid: true,
      normalized: "IN",
    });
  });

  it("rejects malformed currency and country codes with a field reason", () => {
    const currency = validateCatalogCode("currency", "US");
    expect(currency.valid).toBe(false);
    if (!currency.valid) {
      expect(currency.reason).toContain("three");
    }

    expect(validateCatalogCode("country", "IND").valid).toBe(false);
  });

  it("normalizes BCP 47 language tags", () => {
    expect(validateCatalogCode("language", "EN-us")).toEqual({
      valid: true,
      normalized: "en-US",
    });
    expect(validateCatalogCode("language", "english").valid).toBe(false);
  });

  it("accepts IANA time zones via Intl and rejects unknown zones", () => {
    expect(validateCatalogCode("timezone", "Asia/Kolkata").valid).toBe(true);
    expect(validateCatalogCode("timezone", "Mars/Olympus").valid).toBe(false);
  });

  it("accepts structurally valid date and time formats", () => {
    expect(validateCatalogCode("date_format", "YYYY-MM-DD").valid).toBe(true);
    expect(validateCatalogCode("date_format", "DD/MM/YYYY").valid).toBe(true);
    expect(validateCatalogCode("date_format", "YYYY-DD").valid).toBe(false);
    expect(validateCatalogCode("time_format", "HH:mm").valid).toBe(true);
    expect(validateCatalogCode("time_format", "hh:mm A").valid).toBe(true);
    expect(validateCatalogCode("time_format", "25:00").valid).toBe(false);
  });

  it("normalizes slug catalogs and rejects punctuation", () => {
    expect(normalizeCatalogCode("branch_type", " Homestay ")).toBe("homestay");
    const slug = validateCatalogCode("branch_type", "Homestay");
    expect(slug.valid).toBe(true);
    if (slug.valid) {
      expect(slug.normalized).toBe("homestay");
    }
    expect(validateCatalogCode("branch_type", "branch-type").valid).toBe(false);
  });

  it("exposes exactly the ten canonical catalog keys", () => {
    expect(CATALOG_KEYS).toHaveLength(10);
  });
});
