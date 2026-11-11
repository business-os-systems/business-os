import { describe, expect, it } from "vitest";
import { storefrontReadService } from "../../src/services/storefront/storefront.service.js";

const enabled = Boolean(process.env.DATABASE_URL);
const RUN = Date.now().toString(36);

describe.skipIf(!enabled)("storefront delivery outcomes (FR-065)", () => {
  it("returns not found for a malformed page path without a lookup", async () => {
    const outcome = await storefrontReadService.readPage({
      host: "unknown-" + RUN + ".example.test",
      path: "../etc/passwd",
    });
    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("returns not found for a host that resolves to no site", async () => {
    const outcome = await storefrontReadService.readPage({
      host: "unknown-" + RUN + ".example.test",
      path: "/",
    });
    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("returns not found when the host has no active domain", async () => {
    const outcome = await storefrontReadService.resolveHost(
      "unknown-" + RUN + ".example.test"
    );
    expect(outcome).toEqual({ kind: "not_found" });
  });
});
