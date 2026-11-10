import { describe, expect, it } from "vitest";
import {
  BREAK_GLASS_HEADER,
  BREAK_GLASS_SECRET_HEADER,
  isBreakGlassAdmitted,
} from "../src/app/(auth)/break-glass/break-glass-gate.js";

const SECRET = "test-break-glass-proxy-secret";

describe("break-glass admission gate", () => {
  it("denies a missing, empty or non-canonical proxy flag", () => {
    expect(isBreakGlassAdmitted(null, SECRET, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted(undefined, SECRET, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("", SECRET, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("0", SECRET, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("true", SECRET, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("1 ", SECRET, SECRET)).toBe(false);
  });

  it("admits only the flag plus the configured shared secret", () => {
    expect(isBreakGlassAdmitted("1", SECRET, SECRET)).toBe(true);
    expect(isBreakGlassAdmitted("1", null, SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("1", "", SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("1", "wrong-secret", SECRET)).toBe(false);
    expect(isBreakGlassAdmitted("1", SECRET, undefined)).toBe(false);
    expect(isBreakGlassAdmitted("1", SECRET, "   ")).toBe(false);
  });

  it("fails closed when the configured secret is absent", () => {
    // The default argument reads the validated config boundary; tests run
    // without BREAK_GLASS_PROXY_SECRET.
    expect(isBreakGlassAdmitted("1", "anything")).toBe(false);
  });

  it("uses the private header names the proxy overwrites", () => {
    expect(BREAK_GLASS_HEADER).toBe("x-break-glass-verified");
    expect(BREAK_GLASS_SECRET_HEADER).toBe("x-break-glass-secret");
  });
});
