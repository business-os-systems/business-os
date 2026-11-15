import { describe, expect, it } from "vitest";
import {
  appearanceTokenValueIssue,
  isAppearanceTokenKey,
  isHexColour,
  joinLength,
  lengthLabel,
  splitLength,
} from "../../src/appearance/index.js";

describe("value guards (FR-018)", () => {
  it("accepts only six-digit hex", () => {
    expect(isHexColour("#AABBCC")).toBe(true);
    expect(isHexColour("red")).toBe(false);
    expect(isHexColour("#ABC")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(appearanceTokenValueIssue("colorPrimary", 12)).toContain("text");
  });

  it("rejects a colour the contract cannot render", () => {
    expect(appearanceTokenValueIssue("colorPrimary", "red")).toContain("hex");
  });

  it("accepts a contract colour", () => {
    expect(appearanceTokenValueIssue("colorPrimary", "#1F5A44")).toBeNull();
  });

  it("rejects a font the platform does not host", () => {
    expect(appearanceTokenValueIssue("fontBody", "Comic Sans MS, cursive")).toContain("hosts");
    expect(appearanceTokenValueIssue("fontBody", "Inter, system-ui, sans-serif")).toBeNull();
  });

  it("narrows a declared key only", () => {
    expect(isAppearanceTokenKey("colorPrimary")).toBe(true);
    expect(isAppearanceTokenKey("primaryColor")).toBe(false);
  });
});

describe("length helpers", () => {
  it("splits a stored length into amount and unit", () => {
    expect(splitLength("2.5rem")).toEqual({ amount: "2.5", unit: "rem" });
    expect(splitLength(" 12px ")).toEqual({ amount: "12", unit: "px" });
    expect(splitLength("no-unit")).toBeNull();
  });

  it("rebuilds a length from amount and unit", () => {
    expect(joinLength(" 2.5 ", "rem")).toBe("2.5rem");
    expect(joinLength("0", "px")).toBe("0px");
  });

  it("returns the value when the rem amount is not finite", () => {
    expect(lengthLabel("Infinityrem")).toBe("Infinityrem");
  });
});
