import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatformPrismaClient, type PrismaClient } from "@suite/db";
import { appendPlatformAuditEvent } from "@suite/auth/platform";

function loadLocalPlatformEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const keys = new Set(["PLATFORM_DATABASE_URL"]);
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!keys.has(key) || process.env[key] !== undefined) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

loadLocalPlatformEnv();

const databaseUrl = process.env.PLATFORM_DATABASE_URL;
const enabled = Boolean(databaseUrl);

interface HashInput {
  readonly prevHash: string | null;
  readonly actorOperatorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly organizationId: string | null;
  readonly beforeText: string;
  readonly afterText: string;
  readonly reason: string | null;
  readonly requestId: string;
  readonly occurredAt: Date;
}

function encodeField(value: string | null): string {
  const text = value ?? "";
  return `${Buffer.byteLength(text, "utf8")}:${text}`;
}

/**
 * Independent implementation of the trigger's documented payload. It must stay
 * byte-for-byte identical to platform.fn_audit_hash so the chain can be
 * verified before T016 ships the SQL verifier.
 */
function computeAuditHash(input: HashInput): string {
  const payload = [
    encodeField(input.prevHash ?? "GENESIS"),
    encodeField(input.actorOperatorId),
    encodeField(input.action),
    encodeField(input.entityType),
    encodeField(input.entityId),
    encodeField(input.organizationId),
    encodeField(input.beforeText),
    encodeField(input.afterText),
    encodeField(input.reason),
    encodeField(input.requestId),
    encodeField(input.occurredAt.toISOString()),
  ].join("");
  return createHash("sha256").update(payload).digest("hex");
}

describe.skipIf(!enabled)("Platform audit hash chain", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPlatformPrismaClient({ databaseUrl: databaseUrl ?? "" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("chains consecutive records with the trigger-computed hashes", async () => {
    const firstOccurredAt = new Date();
    const secondOccurredAt = new Date(firstOccurredAt.getTime() + 1);
    const firstInput = {
      actorOperatorId: null,
      action: "REVIEW_CHAIN_TEST",
      entityType: "Review",
      entityId: "first",
      requestId: `chain-${Date.now()}-1`,
      occurredAt: firstOccurredAt,
    };
    const secondInput = {
      ...firstInput,
      entityId: "second",
      requestId: `chain-${Date.now()}-2`,
      occurredAt: secondOccurredAt,
    };

    const [first, second] = await prisma.$transaction(async (tx) => {
      const firstRecord = await appendPlatformAuditEvent(tx, firstInput);
      const secondRecord = await appendPlatformAuditEvent(tx, secondInput);
      return [firstRecord, secondRecord];
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) {
      throw new Error("Audit chain insert returned no records");
    }

    expect(first.recordHash).toBe(
      computeAuditHash({
        prevHash: first.prevHash,
        actorOperatorId: first.actorOperatorId,
        action: first.action,
        entityType: first.entityType,
        entityId: first.entityId,
        organizationId: first.organizationId,
        beforeText: "",
        afterText: "",
        reason: first.reason,
        requestId: first.requestId,
        occurredAt: first.occurredAt,
      })
    );
    expect(second.prevHash).toBe(first.recordHash);
    expect(second.recordHash).toBe(
      computeAuditHash({
        prevHash: first.recordHash,
        actorOperatorId: second.actorOperatorId,
        action: second.action,
        entityType: second.entityType,
        entityId: second.entityId,
        organizationId: second.organizationId,
        beforeText: "",
        afterText: "",
        reason: second.reason,
        requestId: second.requestId,
        occurredAt: second.occurredAt,
      })
    );
  });
});
