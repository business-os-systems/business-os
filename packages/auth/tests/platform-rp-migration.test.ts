import { describe, expect, it } from "vitest";
import {
  assessRelyingPartyBinding,
  normalizeRelyingPartyId,
} from "../src/platform/rp-migration.js";

const CURRENT_RP_ID = "ops.example.com";
const OLD_RP_ID = "old.example.com";

describe("relying-party binding", () => {
  it.each([
    ["an identical identity is current", CURRENT_RP_ID, CURRENT_RP_ID, "current"],
    ["case and a root dot are normalised", "OPS.Example.COM.", CURRENT_RP_ID, "current"],
    ["a previous domain requires re-enrolment", CURRENT_RP_ID, OLD_RP_ID, "re_enrolment_required"],
    ["a missing binding is unbound", CURRENT_RP_ID, null, "unbound"],
    ["a blank binding is unbound", CURRENT_RP_ID, "  ", "unbound"],
    ["a malformed binding requires re-enrolment", CURRENT_RP_ID, "bad_domain!", "re_enrolment_required"],
  ] as const)("%s", (_name, currentRpID, enrolledRpID, expected) => {
    const binding = assessRelyingPartyBinding({ currentRpID, enrolledRpID });
    expect(binding.state).toBe(expected);
  });

  it("reports both identities when re-enrolment is required", () => {
    expect(
      assessRelyingPartyBinding({
        currentRpID: CURRENT_RP_ID,
        enrolledRpID: OLD_RP_ID,
      })
    ).toEqual({
      state: "re_enrolment_required",
      currentRpID: CURRENT_RP_ID,
      enrolledRpID: OLD_RP_ID,
    });
  });

  it.each([
    ["an empty ID", ""],
    ["a spaced ID", "ops example"],
    ["an underscore label", "ops_example.com"],
    ["an IPv4 address", "10.0.0.4"],
    ["a leading hyphen", "-ops.example.com"],
  ])("rejects %s", (_name, value) => {
    expect(() => normalizeRelyingPartyId(value)).toThrow(RangeError);
  });
});
