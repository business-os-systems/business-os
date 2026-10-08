import { describe, it, expect } from "vitest";
import {
  calculateBusinessDate,
  isNightAuditDue,
  isValidBusinessDate,
  DEFAULT_TURNOVER_HOUR,
} from "@suite/core";

describe("Integration: 4 AM Night Audit Boundary & Turnover Clock", () => {
  describe("Core 4 AM Boundary Turnover (03:59:59 AM vs 04:00:01 AM)", () => {
    it("assigns 03:59:59 AM to the previous calendar business day in Asia/Kolkata", () => {
      // 2026-10-08 03:59:59 AM IST -> UTC: 2026-10-07T22:29:59.000Z
      const preTurnover = new Date("2026-10-08T03:59:59+05:30");
      const businessDate = calculateBusinessDate(preTurnover, "Asia/Kolkata");

      expect(businessDate).toBe("2026-10-07");
    });

    it("assigns 04:00:01 AM to the current calendar business day in Asia/Kolkata", () => {
      // 2026-10-08 04:00:01 AM IST
      const postTurnover = new Date("2026-10-08T04:00:01+05:30");
      const businessDate = calculateBusinessDate(postTurnover, "Asia/Kolkata");

      expect(businessDate).toBe("2026-10-08");
    });

    it("assigns exact 04:00:00 AM to the current business day", () => {
      const exactTurnover = new Date("2026-10-08T04:00:00+05:30");
      const businessDate = calculateBusinessDate(exactTurnover, "Asia/Kolkata");

      expect(businessDate).toBe("2026-10-08");
    });
  });

  describe("Multi-Timezone Validation", () => {
    it("handles America/New_York (EDT) 4 AM boundary accurately", () => {
      // 2026-06-15 03:59:59 AM EDT
      const nyPre = new Date("2026-06-15T03:59:59-04:00");
      const nyPost = new Date("2026-06-15T04:00:01-04:00");

      expect(calculateBusinessDate(nyPre, "America/New_York")).toBe("2026-06-14");
      expect(calculateBusinessDate(nyPost, "America/New_York")).toBe("2026-06-15");
    });

    it("handles UTC 4 AM boundary accurately", () => {
      const utcPre = new Date("2026-12-01T03:59:59Z");
      const utcPost = new Date("2026-12-01T04:00:01Z");

      expect(calculateBusinessDate(utcPre, "UTC")).toBe("2026-11-30");
      expect(calculateBusinessDate(utcPost, "UTC")).toBe("2026-12-01");
    });
  });

  describe("Calendar Boundary Edge Cases (Month-End & Year-End Rollover)", () => {
    it("rolls over month boundaries (March 31 to April 1)", () => {
      // April 1 at 02:30 AM is still March 31 operational business day
      const aprilEarlyMorning = new Date("2026-04-01T02:30:00+05:30");
      expect(calculateBusinessDate(aprilEarlyMorning, "Asia/Kolkata")).toBe("2026-03-31");

      // April 1 at 04:15 AM belongs to April 1
      const aprilPostTurnover = new Date("2026-04-01T04:15:00+05:30");
      expect(calculateBusinessDate(aprilPostTurnover, "Asia/Kolkata")).toBe("2026-04-01");
    });

    it("rolls over year boundaries (New Year Eve to New Year Day)", () => {
      // Jan 1 03:45 AM belongs to Dec 31 of the previous year
      const newYearEarly = new Date("2027-01-01T03:45:00+05:30");
      expect(calculateBusinessDate(newYearEarly, "Asia/Kolkata")).toBe("2026-12-31");

      // Jan 1 04:05 AM belongs to Jan 1 of the new year
      const newYearPost = new Date("2027-01-01T04:05:00+05:30");
      expect(calculateBusinessDate(newYearPost, "Asia/Kolkata")).toBe("2027-01-01");
    });

    it("handles leap year boundaries correctly", () => {
      // Leap year 2028: March 1 03:00 AM belongs to Feb 29
      const leapEarly = new Date("2028-03-01T03:00:00+05:30");
      expect(calculateBusinessDate(leapEarly, "Asia/Kolkata")).toBe("2028-02-29");
    });
  });

  describe("Configurable Turnover Hour Support", () => {
    it("respects custom turnover hour (e.g. 6 AM for nightclub/casino)", () => {
      const customTurnoverHour = 6;
      const fiveAm = new Date("2026-10-08T05:30:00+05:30");
      const sevenAm = new Date("2026-10-08T07:00:00+05:30");

      expect(
        calculateBusinessDate(fiveAm, "Asia/Kolkata", customTurnoverHour)
      ).toBe("2026-10-07");

      expect(
        calculateBusinessDate(sevenAm, "Asia/Kolkata", customTurnoverHour)
      ).toBe("2026-10-08");
    });

    it("defaults to 4 AM turnover hour", () => {
      expect(DEFAULT_TURNOVER_HOUR).toBe(4);
    });
  });

  describe("Night Audit Due Trigger Evaluation (isNightAuditDue)", () => {
    it("returns true when current business date is ahead of last closed date", () => {
      const lastClosed = "2026-10-06";
      const current = "2026-10-07";

      expect(isNightAuditDue(lastClosed, current)).toBe(true);
    });

    it("returns false when night audit is already closed for current business date", () => {
      const lastClosed = "2026-10-07";
      const current = "2026-10-07";

      expect(isNightAuditDue(lastClosed, current)).toBe(false);
    });

    it("validates date format strictly with isValidBusinessDate", () => {
      expect(isValidBusinessDate("2026-10-08")).toBe(true);
      expect(isValidBusinessDate("2026-02-30")).toBe(false); // Invalid leap
      expect(isValidBusinessDate("not-a-date")).toBe(false);
    });
  });
});
