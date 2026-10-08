import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  calculateBusinessDate,
  getBusinessDateDiffDays,
  getNextBusinessDate,
  getPreviousBusinessDate,
  isNightAuditDue,
  isValidBusinessDate,
} from "../src/index.js";

describe("@suite/core - 4:00 AM Operational Clock Engine", () => {
  describe("4:00 AM Turnover Boundary Calculations", () => {
    it("assigns 03:59:59 AM to the PREVIOUS operational day in Asia/Kolkata (+05:30)", () => {
      // 2026-10-09 03:59:59 IST is 2026-10-08 22:29:59 UTC
      const timestamp = new Date("2026-10-08T22:29:59.000Z");
      const businessDate = calculateBusinessDate(timestamp, "Asia/Kolkata", 4);
      expect(businessDate).toBe("2026-10-08");
    });

    it("assigns 04:00:00 AM to the CURRENT operational day in Asia/Kolkata (+05:30)", () => {
      // 2026-10-09 04:00:00 IST is 2026-10-08 22:30:00 UTC
      const timestamp = new Date("2026-10-08T22:30:00.000Z");
      const businessDate = calculateBusinessDate(timestamp, "Asia/Kolkata", 4);
      expect(businessDate).toBe("2026-10-09");
    });

    it("assigns 03:59:59 AM to previous operational day in America/New_York (EDT UTC-4)", () => {
      // 2026-07-15 03:59:59 EDT is 2026-07-15 07:59:59 UTC
      const timestamp = new Date("2026-07-15T07:59:59.000Z");
      const businessDate = calculateBusinessDate(timestamp, "America/New_York", 4);
      expect(businessDate).toBe("2026-07-14");
    });

    it("assigns 04:00:00 AM to current operational day in America/New_York (EDT UTC-4)", () => {
      // 2026-07-15 04:00:00 EDT is 2026-07-15 08:00:00 UTC
      const timestamp = new Date("2026-07-15T08:00:00.000Z");
      const businessDate = calculateBusinessDate(timestamp, "America/New_York", 4);
      expect(businessDate).toBe("2026-07-15");
    });

    it("handles New Year transition (Jan 1, 02:00 AM -> Dec 31 previous year)", () => {
      // 2027-01-01 02:30:00 UTC
      const timestamp = new Date("2027-01-01T02:30:00.000Z");
      const businessDate = calculateBusinessDate(timestamp, "UTC", 4);
      expect(businessDate).toBe("2026-12-31");
    });

    it("handles Leap Year transition (March 1 01:00 AM -> Feb 29 in leap year 2028)", () => {
      // 2028-03-01 01:00:00 UTC
      const timestamp = new Date("2028-03-01T01:00:00.000Z");
      const businessDate = calculateBusinessDate(timestamp, "UTC", 4);
      expect(businessDate).toBe("2028-02-29");
    });

    it("supports custom branch turnover hour (e.g. 6:00 AM for early bakery/breakfast)", () => {
      // 2026-10-09 05:30:00 UTC with turnover hour 6
      const timestamp = new Date("2026-10-09T05:30:00.000Z");
      expect(calculateBusinessDate(timestamp, "UTC", 6)).toBe("2026-10-08");

      // 2026-10-09 06:00:00 UTC with turnover hour 6
      const nextTimestamp = new Date("2026-10-09T06:00:00.000Z");
      expect(calculateBusinessDate(nextTimestamp, "UTC", 6)).toBe("2026-10-09");
    });

    it("handles Daylight Saving Time (DST) fallback in New York without date drift", () => {
      // November 1, 2026 is US DST fallback (2 AM clocks fall back to 1 AM)
      // 2026-11-01 03:00:00 EST is 2026-11-01 08:00:00 UTC (before 4 AM turnover)
      const beforeTurnover = new Date("2026-11-01T08:00:00.000Z");
      expect(calculateBusinessDate(beforeTurnover, "America/New_York", 4)).toBe("2026-10-31");

      // 2026-11-01 04:00:00 EST is 2026-11-01 09:00:00 UTC (at 4 AM turnover)
      const atTurnover = new Date("2026-11-01T09:00:00.000Z");
      expect(calculateBusinessDate(atTurnover, "America/New_York", 4)).toBe("2026-11-01");
    });
  });

  describe("Night Audit Due & Calendar Arithmetic", () => {
    it("correctly identifies when night audit is due", () => {
      expect(isNightAuditDue("2026-10-07", "2026-10-08")).toBe(true);
      expect(isNightAuditDue("2026-10-08", "2026-10-08")).toBe(false);
      expect(isNightAuditDue("2026-10-09", "2026-10-08")).toBe(false);
    });

    it("advances and decrements business dates deterministically", () => {
      expect(getNextBusinessDate("2026-10-08")).toBe("2026-10-09");
      expect(getPreviousBusinessDate("2026-10-08")).toBe("2026-10-07");
      expect(addBusinessDays("2026-10-31", 1)).toBe("2026-11-01");
      expect(addBusinessDays("2026-12-31", 1)).toBe("2027-01-01");
      expect(addBusinessDays("2028-02-28", 1)).toBe("2028-02-29");
    });

    it("calculates accurate day differences", () => {
      expect(getBusinessDateDiffDays("2026-10-01", "2026-10-10")).toBe(9);
      expect(getBusinessDateDiffDays("2026-10-10", "2026-10-01")).toBe(-9);
      expect(getBusinessDateDiffDays("2026-10-08", "2026-10-08")).toBe(0);
    });

    it("validates business date strings", () => {
      expect(isValidBusinessDate("2026-10-08")).toBe(true);
      expect(isValidBusinessDate("2026-02-29")).toBe(false); // 2026 is not leap year
      expect(isValidBusinessDate("2028-02-29")).toBe(true);  // 2028 is leap year
      expect(isValidBusinessDate("invalid-date")).toBe(false);
      expect(isValidBusinessDate("2026-13-01")).toBe(false);
    });
  });
});
