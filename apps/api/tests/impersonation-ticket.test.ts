import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signImpersonationTicket,
  verifyImpersonationTicket,
  type ImpersonationTicketPayload,
} from "../src/services/admin/impersonation-ticket.js";

const SECRET = "test-control-session-signing-secret-32ch-min";
const OTHER_SECRET = "another-control-session-signing-secret-32ch";
const TICKET_KEY_CONTEXT = "platform:impersonation:ticket";
const NOW = Date.parse("2026-11-09T13:00:00.000Z");

const PAYLOAD: ImpersonationTicketPayload = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  operatorId: "op_support_probe",
  organizationId: "org_support_probe",
  exp: Math.floor(NOW / 1000) + 600,
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(encodedPayload: string): string {
  const key = createHmac("sha256", SECRET).update(TICKET_KEY_CONTEXT).digest();
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

describe("Support-session ticket verification (FR-050)", () => {
  it("round-trips an authentic, unexpired ticket", () => {
    const token = signImpersonationTicket(SECRET, PAYLOAD);

    expect(verifyImpersonationTicket(SECRET, token, NOW)).toEqual(PAYLOAD);
  });

  it("rejects a ticket signed with another key", () => {
    const token = signImpersonationTicket(OTHER_SECRET, PAYLOAD);

    expect(verifyImpersonationTicket(SECRET, token, NOW)).toBeNull();
  });

  it("rejects a ticket whose payload was swapped", () => {
    const token = signImpersonationTicket(SECRET, PAYLOAD);
    const signature = token.split(".")[1];
    const forgedPayload = encode({ ...PAYLOAD, organizationId: "org_other" });

    expect(
      verifyImpersonationTicket(SECRET, `${forgedPayload}.${signature ?? ""}`, NOW)
    ).toBeNull();
  });

  it("rejects a missing separator, an empty segment and extra segments", () => {
    const valid = signImpersonationTicket(SECRET, PAYLOAD);
    const [encodedPayload, signature] = valid.split(".");

    const malformed = [
      encodedPayload ?? "",
      `.${signature ?? ""}`,
      `${encodedPayload ?? ""}.`,
      `${valid}.extra`,
    ];

    expect(
      malformed.map((token) => verifyImpersonationTicket(SECRET, token, NOW))
    ).toEqual([null, null, null, null]);
  });

  it("rejects a signature of the wrong length", () => {
    const encodedPayload = encode(PAYLOAD);

    expect(
      verifyImpersonationTicket(SECRET, `${encodedPayload}.short`, NOW)
    ).toBeNull();
  });

  it("rejects a correctly signed payload that is not JSON", () => {
    const encodedPayload = Buffer.from("not-json", "utf8").toString("base64url");
    const token = `${encodedPayload}.${signPayload(encodedPayload)}`;

    expect(verifyImpersonationTicket(SECRET, token, NOW)).toBeNull();
  });

  it("rejects a correctly signed payload with the wrong shape", () => {
    const encodedPayload = encode({ ticketId: "not-a-uuid" });
    const token = `${encodedPayload}.${signPayload(encodedPayload)}`;

    expect(verifyImpersonationTicket(SECRET, token, NOW)).toBeNull();
  });

  it("rejects an expired ticket", () => {
    const token = signImpersonationTicket(SECRET, {
      ...PAYLOAD,
      exp: Math.floor(NOW / 1000) - 1,
    });

    expect(verifyImpersonationTicket(SECRET, token, NOW)).toBeNull();
  });

});

describe("Support-session ticket signing (FR-050)", () => {
  it("refuses to sign a payload outside the contract", () => {
    expect(() =>
      signImpersonationTicket(SECRET, {
        ...PAYLOAD,
        exp: 0,
      })
    ).toThrow();
  });
});
