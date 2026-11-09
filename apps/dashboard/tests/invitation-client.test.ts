import { afterEach, describe, expect, it, vi } from "vitest";
import { loadInvitationDetails } from "../src/lib/invitation-client";

const invitation = {
  isValid: true,
  token: "token_probe",
  email: "invitee@example.com",
  name: "Invitee",
  organizationName: "River View",
  roleName: "Manager",
  branchName: "Main Wing",
  hasPassword: false,
  expiresAt: "2026-12-01T00:00:00.000Z",
};

function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(response)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadInvitationDetails", () => {
  it("returns validated details for a live invitation", async () => {
    stubFetch(new Response(JSON.stringify(invitation), { status: 200 }));

    const result = await loadInvitationDetails("token_probe");
    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") return;
    expect(result.details.email).toBe("invitee@example.com");
  });

  it("reports an already-accepted invitation with the backend detail", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          code: "INVITATION_ACCEPTED",
          detail: "This invitation has already been accepted.",
        }),
        { status: 409 }
      )
    );

    const result = await loadInvitationDetails("token_probe");
    expect(result).toEqual({
      kind: "already-accepted",
      message: "This invitation has already been accepted.",
    });
  });

  it("reports an invalid invitation with the RFC 7807 detail", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          code: "INVITATION_NOT_FOUND",
          detail: "This invitation link is invalid or has expired.",
        }),
        { status: 404 }
      )
    );

    const result = await loadInvitationDetails("token_probe");
    expect(result).toEqual({
      kind: "invalid",
      message: "This invitation link is invalid or has expired.",
    });
  });

  it("refuses a malformed success payload instead of guessing fields", async () => {
    stubFetch(
      new Response(JSON.stringify({ email: "invitee@example.com" }), {
        status: 200,
      })
    );

    const result = await loadInvitationDetails("token_probe");
    expect(result.kind).toBe("invalid");
  });

  it("propagates a transport failure to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))
    );

    await expect(loadInvitationDetails("token_probe")).rejects.toThrow("offline");
  });
});
