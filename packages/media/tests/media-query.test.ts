import { describe, expect, it } from "vitest";
import {
  buildMediaListQuery,
  toMediaTypeFilter,
} from "../src/react/index.js";

describe("media query builder", () => {
  it("omits empty filters so the API receives exactly what was asked", () => {
    expect(
      buildMediaListQuery({ search: "   ", type: "ALL", unusedOnly: false }, 24)
    ).toEqual({ limit: 24 });
  });

  it("carries a trimmed search, the asset type and the unused toggle", () => {
    expect(
      buildMediaListQuery(
        { search: " logo ", type: "IMAGE", unusedOnly: true },
        24
      )
    ).toEqual({ limit: 24, search: "logo", type: "IMAGE", unused: true });
  });

  it("rejects an unknown type filter instead of guessing a kind", () => {
    expect(toMediaTypeFilter("VIDEO")).toBe("ALL");
    expect(toMediaTypeFilter("IMAGE")).toBe("IMAGE");
    expect(toMediaTypeFilter("ALL")).toBe("ALL");
  });
});
