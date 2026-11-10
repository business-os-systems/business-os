import { describe, expect, it } from "vitest";
import { Prisma } from "@suite/db";
import { isUniqueConstraintViolation } from "../src/services/admin/prisma-errors.js";

function prismaError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Constraint failed", {
    code,
    clientVersion: "6.19.3",
    ...(meta === undefined ? {} : { meta }),
  });
}

describe("isUniqueConstraintViolation", () => {
  it("matches any P2002 when no field is requested", () => {
    expect(isUniqueConstraintViolation(prismaError("P2002"))).toBe(true);
  });

  it("rejects non-Prisma and non-unique errors", () => {
    expect(isUniqueConstraintViolation(new Error("boom"))).toBe(false);
    expect(isUniqueConstraintViolation(prismaError("P2025"))).toBe(false);
  });

  it("matches a field in a string target", () => {
    expect(
      isUniqueConstraintViolation(prismaError("P2002", { target: "email" }), "email"),
    ).toBe(true);
    expect(
      isUniqueConstraintViolation(prismaError("P2002", { target: "slug" }), "email"),
    ).toBe(false);
  });

  it("matches a field in an array target", () => {
    expect(
      isUniqueConstraintViolation(
        prismaError("P2002", { target: ["organizationId", "email"] }),
        "email",
      ),
    ).toBe(true);
    expect(
      isUniqueConstraintViolation(
        prismaError("P2002", { target: ["organizationId"] }),
        "email",
      ),
    ).toBe(false);
  });

  it("rejects a field lookup when the target is missing", () => {
    expect(isUniqueConstraintViolation(prismaError("P2002"), "email")).toBe(false);
  });
});
