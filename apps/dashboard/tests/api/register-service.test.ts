import { beforeEach, describe, expect, it, vi } from "vitest";
import { partiallyMatches } from "./expect-matchers";
import {
  deriveNameFromEmail,
  registerCredentialAccount,
} from "../../src/services/register.service";

const PASSWORD = "SecurePassword123!";
const ORIGIN = "https://app.example.com";
const NEW_EMAIL = "jane.doe@company.com";

const dbMocks = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));
const redisMocks = vi.hoisted(() => ({ enqueueEmail: vi.fn() }));
const passwordMocks = vi.hoisted(() => ({ hashPassword: vi.fn() }));

vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));
vi.mock("@suite/redis", () => ({ enqueueEmail: redisMocks.enqueueEmail }));
vi.mock("@suite/auth/password", () => ({ hashPassword: passwordMocks.hashPassword }));

function primeHappyPath(): void {
  vi.clearAllMocks();
  redisMocks.enqueueEmail.mockResolvedValue(undefined);
  passwordMocks.hashPassword.mockResolvedValue("hash");
}

describe("register service name derivation", () => {
  it("derives a human display name from an email local part", () => {
    expect(deriveNameFromEmail("rohit.bahuguna@example.com")).toBe("Rohit Bahuguna");
    expect(deriveNameFromEmail("operator@company.com")).toBe("Operator");
  });
});

describe("register service for a known email", () => {
  beforeEach(primeHappyPath);

  it("returns existing_account and dispatches a notice", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1" });

    const result = await registerCredentialAccount({
      email: "known@company.com",
      password: PASSWORD,
      origin: ORIGIN,
    });

    expect(result).toEqual({ status: "existing_account" });
    expect(redisMocks.enqueueEmail).toHaveBeenCalledWith(
      partiallyMatches({ to: "known@company.com" })
    );
    expect(dbMocks.prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("register service for a new email", () => {
  beforeEach(primeHappyPath);

  it("creates a credential account with a derived name", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    dbMocks.prisma.user.create.mockResolvedValueOnce({
      id: "usr_new",
      email: NEW_EMAIL,
      name: "Jane Doe",
    });

    const result = await registerCredentialAccount({
      email: NEW_EMAIL,
      password: PASSWORD,
      origin: ORIGIN,
    });

    expect(result).toEqual({
      status: "created",
      user: { id: "usr_new", email: NEW_EMAIL, name: "Jane Doe" },
    });
    expect(passwordMocks.hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(dbMocks.prisma.user.create).toHaveBeenCalledWith(
      partiallyMatches({
        data: partiallyMatches({
          email: NEW_EMAIL,
          name: "Jane Doe",
          accounts: partiallyMatches({
            create: partiallyMatches({ providerId: "credential" }),
          }),
        }),
      })
    );
  });

  it("prefers an explicitly supplied display name", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    dbMocks.prisma.user.create.mockResolvedValueOnce({
      id: "usr_named",
      email: "team@company.com",
      name: "Named Owner",
    });

    await registerCredentialAccount({
      email: "team@company.com",
      password: PASSWORD,
      name: "  Named Owner  ",
      origin: ORIGIN,
    });

    expect(dbMocks.prisma.user.create).toHaveBeenCalledWith(
      partiallyMatches({ data: partiallyMatches({ name: "Named Owner" }) })
    );
  });
});
