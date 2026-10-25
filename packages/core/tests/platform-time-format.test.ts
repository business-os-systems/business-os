import { describe, expect, it } from "vitest";
import {
  formatBranchDate,
  formatBranchDateTime,
  formatBranchTime,
  formatUtcTimestamp,
  isValidIanaTimeZone,
  parseUtcTimestamp,
  toUtcInstant,
} from "../src/index.js";

describe("@suite/core - UTC storage and branch time rendering", () => {
  it("stores and serializes instants in UTC", () => {
    expect(formatUtcTimestamp("2026-10-25T12:00:00Z")).toBe(
      "2026-10-25T12:00:00.000Z"
    );
    expect(
      toUtcInstant("2026-10-25T12:00:00+05:30").toISOString()
    ).toBe("2026-10-25T06:30:00.000Z");
  });

  it("requires an explicit offset when parsing a stored timestamp", () => {
    expect(() => parseUtcTimestamp("2026-10-25T12:00:00")).toThrow(
      /explicit UTC offset/
    );
    expect(parseUtcTimestamp("2026-10-25T12:00:00Z").toISOString()).toBe(
      "2026-10-25T12:00:00.000Z"
    );
  });

  it("renders the same instant in the branch time zone", () => {
    const instant = "2026-10-25T06:30:00Z";
    expect(
      formatBranchTime(instant, {
        timeZone: "Asia/Kolkata",
        locale: "en-US",
      })
    ).toMatch(/12:00\s?PM/);
    expect(
      formatBranchDate(instant, {
        timeZone: "Asia/Kolkata",
        locale: "en-US",
      })
    ).toContain("Oct");
  });

  it("handles the daylight-saving transition in the branch time zone", () => {
    const before = formatBranchTime("2026-03-08T06:30:00Z", {
      timeZone: "America/New_York",
      locale: "en-US",
    });
    const after = formatBranchTime("2026-03-08T07:30:00Z", {
      timeZone: "America/New_York",
      locale: "en-US",
    });

    expect(before).toMatch(/1:30\s?AM/);
    expect(after).toMatch(/3:30\s?AM/);
    expect(before).not.toBe(after);
  });

  it("rejects invalid time zones rather than falling back", () => {
    expect(isValidIanaTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(() =>
      formatBranchDateTime("2026-10-25T06:30:00Z", {
        timeZone: "Mars/Olympus",
        locale: "en-US",
      })
    ).toThrow(/Invalid branch time zone/);
  });
});
