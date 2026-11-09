import { describe, expect, it } from "vitest";
import {
  BREAK_GLASS_HEADER,
  isBreakGlassAdmitted,
} from "../src/app/(auth)/break-glass/break-glass-gate.js";

describe("break-glass admission gate", () => {
  it("denies a missing, empty or non-canonical proxy header", () => {
    expect(isBreakGlassAdmitted(null)).toBe(false);
    expect(isBreakGlassAdmitted(undefined)).toBe(false);
    expect(isBreakGlassAdmitted("")).toBe(false);
    expect(isBreakGlassAdmitted("0")).toBe(false);
    expect(isBreakGlassAdmitted("true")).toBe(false);
    expect(isBreakGlassAdmitted("1 ")).toBe(false);
  });

  it("admits only the exact value the proxy sets after mTLS", () => {
    expect(isBreakGlassAdmitted("1")).toBe(true);
  });

  it("uses the private header name the proxy overwrites", () => {
    expect(BREAK_GLASS_HEADER).toBe("x-break-glass-verified");
  });
});
