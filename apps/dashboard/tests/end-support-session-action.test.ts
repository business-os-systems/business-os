import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted<{ mode: "ok" | "problem" | "transport" }>(
  () => ({ mode: "ok" }),
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("../src/lib/support-session-client", () => {
  class SupportSessionClientError extends Error {
    readonly status: number;
    readonly code: string | null;

    constructor(
      message: string,
      options: { readonly status: number; readonly code: string | null },
    ) {
      super(message);
      this.name = "SupportSessionClientError";
      this.status = options.status;
      this.code = options.code;
    }
  }

  return {
    SupportSessionClientError,
    endSupportSession: vi.fn(() => {
      if (state.mode === "ok") {
        return Promise.resolve({
          endedAt: "2026-11-09T13:20:00.000Z",
          endedBy: "tenant:usr_1",
        });
      }
      if (state.mode === "problem") {
        return Promise.reject(
          new SupportSessionClientError("The session already ended.", {
            status: 409,
            code: "SUPPORT_SESSION_ALREADY_ENDED",
          }),
        );
      }
      return Promise.reject(new Error("socket hang up"));
    }),
  };
});

import { revalidatePath } from "next/cache";
import { endSupportSession } from "../src/lib/support-session-client";
import { endSupportSessionAction } from "../src/app/(dashboard)/settings/security/end-support-session-action";

const endMock = vi.mocked(endSupportSession);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  state.mode = "ok";
  endMock.mockClear();
  revalidateMock.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("tenant support-session termination action", () => {
  it("ends the session and revalidates the security page", async () => {
    const result = await endSupportSessionAction("ticket-1");

    expect(result).toEqual({ ok: true, detail: "" });
    expect(endMock).toHaveBeenCalledWith("ticket-1");
    expect(revalidateMock).toHaveBeenCalledWith("/settings/security");
  });

  it("returns the RFC 7807 detail for a refused termination", async () => {
    state.mode = "problem";

    const result = await endSupportSessionAction("ticket-1");

    expect(result).toEqual({ ok: false, detail: "The session already ended." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("logs and hides a transport failure", async () => {
    state.mode = "transport";

    const result = await endSupportSessionAction("ticket-1");

    expect(result.ok).toBe(false);
    expect(result.detail).toBe(
      "The support session could not be ended. Try again.",
    );
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
