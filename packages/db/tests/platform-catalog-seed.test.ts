import type { Prisma } from "@prisma/client";
import {
  CATALOG_DEFINITIONS,
  CATALOG_KEYS,
  validateCatalogCode,
} from "@suite/core";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  buildReferenceCatalogSeed,
  normalizeCatalogSeedValues,
  ReferenceCatalogSeedError,
} from "../src/reference-catalog-seed-data.js";
import { seedPlatformCatalogs } from "../src/seed-platform-catalogs.js";

const ROLLBACK_SENTINEL = new Error("rollback the catalog seed test transaction");

async function inRollbackTransaction<T>(
  test: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let captured: { value: T } | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        captured = { value: await test(tx) };
        throw ROLLBACK_SENTINEL;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error !== ROLLBACK_SENTINEL) {
      throw error;
    }
  }
  if (captured === undefined) {
    throw new Error("The catalog seed test transaction did not complete.");
  }
  return captured.value;
}

const EXPECTED_VALUE_COUNTS = {
  currency: 156,
  country: 249,
  language: 30,
  date_format: 3,
  time_format: 2,
  tax_system: 10,
  branch_type: 9,
  branch_capability: 6,
  industry_category: 11,
} as const;

describe("reference catalog launch data", () => {
  it("covers all ten catalogs with valid, unique, normalized codes", () => {
    const seed = buildReferenceCatalogSeed();

    expect(seed.groups.map((group) => group.key)).toEqual([...CATALOG_KEYS]);
    expect(seed.catalogs).toHaveLength(CATALOG_KEYS.length);

    for (const group of seed.groups) {
      if (group.key === "timezone") {
        expect(group.values.length).toBeGreaterThanOrEqual(419);
      } else {
        expect(group.values).toHaveLength(EXPECTED_VALUE_COUNTS[group.key]);
      }
      const codes = group.values.map((value) => value.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const value of group.values) {
        expect(value.catalogKey).toBe(group.key);
        expect(value.isActive).toBe(true);
        expect(value.version).toBe(1);
        const validation = validateCatalogCode(group.key, value.code);
        expect(validation.valid).toBe(true);
        if (validation.valid) {
          expect(validation.normalized).toBe(value.code);
        }
      }
    }
  });

  it("keeps the launched catalog labels aligned with the shared registry", () => {
    const seed = buildReferenceCatalogSeed();

    for (const catalog of seed.catalogs) {
      expect(catalog.label).toBe(CATALOG_DEFINITIONS[catalog.key].label);
      expect(catalog.description).toBe(
        CATALOG_DEFINITIONS[catalog.key].description,
      );
    }
  });

  it("keeps the approved launch vocabulary and ordering", () => {
    const seed = buildReferenceCatalogSeed();
    const country = seed.groups.find((group) => group.key === "country");
    const currency = seed.groups.find((group) => group.key === "currency");
    const dateFormat = seed.groups.find((group) => group.key === "date_format");
    const timeFormat = seed.groups.find((group) => group.key === "time_format");
    const timezone = seed.groups.find((group) => group.key === "timezone");

    expect(country?.values[0]?.code).toBe("IN");
    expect(currency?.values.map((value) => value.code)).toEqual(
      expect.arrayContaining(["INR", "USD", "AED", "GBP", "EUR"]),
    );
    expect(currency?.values.map((value) => value.code)).not.toEqual(
      expect.arrayContaining(["HRK", "CUC", "SLL", "ZWL", "XDR", "XSU"]),
    );
    expect(dateFormat?.values.map((value) => value.code)).toEqual([
      "dd/mm/yyyy",
      "mm/dd/yyyy",
      "yyyy-mm-dd",
    ]);
    expect(timeFormat?.values.map((value) => value.code)).toEqual(["12h", "24h"]);
    const timezoneCodes = timezone?.values.map((value) => value.code) ?? [];
    expect(timezoneCodes).toContain("UTC");
    expect(timezoneCodes).toContain("Asia/Kolkata");
    expect(timezoneCodes).toContain("America/New_York");
  });
});

describe("reference catalog normalization", () => {
  it("normalizes codes through the shared catalog validators", () => {
    expect(
      normalizeCatalogSeedValues("currency", [{ code: " usd ", label: "US Dollar" }])[0]?.code,
    ).toBe("USD");
    expect(
      normalizeCatalogSeedValues("language", [
        { code: "EN-us", label: "English (United States)" },
      ])[0]?.code,
    ).toBe("en-US");
    expect(
      normalizeCatalogSeedValues("time_format", [{ code: "24H", label: "24-hour clock" }])[0]?.code,
    ).toBe("24h");
    expect(
      normalizeCatalogSeedValues("date_format", [{ code: "DD/MM/YYYY", label: "Day first" }])[0]
        ?.code,
    ).toBe("dd/mm/yyyy");
  });

  it("assigns stable sort order and the seed provenance", () => {
    const values = normalizeCatalogSeedValues("branch_type", [
      { code: "hotel", label: "Hotel / Resort" },
      { code: "homestay", label: "Homestay / B&B" },
    ]);

    expect(values.map((value) => value.sortOrder)).toEqual([10, 20]);
    expect(values.map((value) => value.createdBy)).toEqual([
      "system:reference-catalog-seed",
      "system:reference-catalog-seed",
    ]);
  });

  it("rejects invalid codes, duplicate normalized codes and empty labels", () => {
    expect(() =>
      normalizeCatalogSeedValues("time_format", [{ code: "25:00", label: "Invalid time pattern" }]),
    ).toThrow(ReferenceCatalogSeedError);

    expect(() =>
      normalizeCatalogSeedValues("currency", [
        { code: "usd", label: "US Dollar" },
        { code: "USD", label: "US Dollar duplicate" },
      ]),
    ).toThrow(/Duplicate currency code "USD"/);

    expect(() => normalizeCatalogSeedValues("country", [{ code: "IN", label: "   " }])).toThrow(
      ReferenceCatalogSeedError,
    );
  });
});

async function readCurrencyUsd(tx: Prisma.TransactionClient) {
  return tx.catalogValue.findUnique({
    where: { catalogKey_code: { catalogKey: "currency", code: "USD" } },
  });
}

async function applyOperatorEdits(tx: Prisma.TransactionClient): Promise<void> {
  await tx.catalogValue.update({
    where: { catalogKey_code: { catalogKey: "currency", code: "USD" } },
    data: {
      label: "Operator USD",
      isActive: false,
      sortOrder: 999,
      version: 7,
    },
  });
  await tx.catalog.update({
    where: { key: "currency" },
    data: { label: "Operator currencies" },
  });
}

async function runIdempotencyScenario(tx: Prisma.TransactionClient) {
  await tx.catalogValue.deleteMany({
    where: { catalogKey: "currency", code: "USD" },
  });

  const first = await seedPlatformCatalogs(tx);
  const firstUsd = await readCurrencyUsd(tx);
  const second = await seedPlatformCatalogs(tx);

  await applyOperatorEdits(tx);

  const third = await seedPlatformCatalogs(tx);
  const after = await readCurrencyUsd(tx);
  const catalogAfter = await tx.catalog.findUnique({
    where: { key: "currency" },
  });
  const rows = await tx.catalogValue.findMany({
    select: { catalogKey: true, code: true },
  });

  return { first, firstUsd, second, third, after, catalogAfter, rows };
}

describe("reference catalog seed idempotency", () => {
  it("inserts missing values, never duplicates and never overwrites operator edits", async () => {
    const result = await inRollbackTransaction(runIdempotencyScenario);

    expect(result.firstUsd?.label).toBe("US Dollar");
    expect(result.firstUsd?.isActive).toBe(true);
    expect(result.first.valuesInserted).toBeGreaterThanOrEqual(1);
    expect(result.first.catalogsInserted + result.first.catalogsSkipped).toBe(CATALOG_KEYS.length);

    expect(result.second.valuesInserted).toBe(0);
    expect(result.second.catalogsInserted).toBe(0);
    expect(result.second.valuesSkipped).toBe(
      result.first.valuesInserted + result.first.valuesSkipped,
    );

    expect(result.third.valuesInserted).toBe(0);
    expect(result.third.catalogsInserted).toBe(0);
    expect(result.after?.label).toBe("Operator USD");
    expect(result.after?.isActive).toBe(false);
    expect(result.after?.sortOrder).toBe(999);
    expect(result.after?.version).toBe(7);
    expect(result.catalogAfter?.label).toBe("Operator currencies");

    const rowKeys = result.rows.map((row) => `${row.catalogKey}:\u0000${row.code}`);
    expect(new Set(rowKeys).size).toBe(rowKeys.length);
  }, 60_000);
});
