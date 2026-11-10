import {
  Prisma,
  type FeatureFlag,
  type FeatureFlagRule,
  type PrismaClient,
} from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  appendPlatformAuditEvent,
  toJsonInput,
} from "@suite/auth/platform";
import { isUniqueConstraintViolation } from "./prisma-errors.js";
import {
  FLAG_ENVIRONMENTS,
  RULE_TYPES,
  isFlagEnvironment,
  isFlagExpired,
  isFlagRuleType,
  type FlagEnvironment,
  type FlagRuleType,
} from "@suite/flags/contracts";
import { invalidateFlagCache } from "@suite/flags";
import { logger } from "@suite/logger";
import { redis } from "@suite/redis";
import type {
  CreateFlagInput,
  FlagRuleInput,
  UpdateFlagInput,
} from "./flags.contract.js";

/**
 * Platform flag lifecycle (T064/T066/T173/T175).
 *
 * Creation always ships the flag off, every mutation writes both its domain
 * audit row and the tamper-evident Platform audit row in the same transaction,
 * and a flag that has expired can never be turned back on. The service takes
 * the Platform runtime identity; it never uses the owner connection.
 */

type FlagWithRules = FeatureFlag & { rules: FeatureFlagRule[] };

export interface FlagRuleRecord {
  readonly id: string;
  readonly ruleType: FlagRuleType;
  readonly targetId: string;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface FlagRecord {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly environment: FlagEnvironment;
  readonly isEnabled: boolean;
  readonly defaultEnabled: boolean;
  readonly version: number;
  readonly owner: string | null;
  readonly expiresAt: string | null;
  readonly removalTicket: string | null;
  readonly isExpired: boolean;
  readonly lifecycleComplete: boolean;
  readonly rules: FlagRuleRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FlagPage {
  readonly items: FlagRecord[];
  readonly nextCursor: string | null;
}

export interface FlagActor {
  readonly operatorId: string;
  readonly requestId: string;
}

export interface ListFlagsInput {
  readonly environment?: FlagEnvironment;
  readonly cursor?: string;
  readonly limit: number;
}

export interface UpdateFlagRequest {
  readonly key: string;
  readonly environment: FlagEnvironment;
  readonly patch: UpdateFlagInput;
  readonly actor: FlagActor;
}

interface FlagCursor {
  readonly environment: string;
  readonly key: string;
}

const FLAG_ENTITY_TYPE = "feature_flag";
const FLAG_CACHE_INVALIDATION_FAILURE =
  "Flag cache invalidation failed after the mutation committed";

const RULE_ORDER: Prisma.FeatureFlagRuleOrderByWithRelationInput[] = [
  { priority: "desc" },
  { id: "asc" },
];

function serializeRule(rule: FeatureFlagRule): FlagRuleRecord {
  if (!isFlagRuleType(rule.ruleType)) {
    throw new Error(
      `Feature flag rule '${rule.id}' has an unknown rule type '${rule.ruleType}'.`
    );
  }
  return {
    id: rule.id,
    ruleType: rule.ruleType,
    targetId: rule.targetId,
    enabled: rule.enabled,
    priority: rule.priority,
  };
}

export function serializeFlag(flag: FlagWithRules): FlagRecord {
  if (!isFlagEnvironment(flag.environment)) {
    throw new Error(
      `Feature flag '${flag.key}' has an unknown environment '${flag.environment}'.`
    );
  }
  return {
    id: flag.id,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    environment: flag.environment,
    isEnabled: flag.isEnabled,
    defaultEnabled: flag.defaultEnabled,
    version: flag.version,
    owner: flag.owner,
    expiresAt: flag.expiresAt?.toISOString() ?? null,
    removalTicket: flag.removalTicket,
    isExpired: isFlagExpired(flag.expiresAt),
    lifecycleComplete:
      flag.owner !== null &&
      flag.expiresAt !== null &&
      flag.removalTicket !== null,
    rules: flag.rules.map(serializeRule),
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
  };
}

function encodeCursor(flag: FlagWithRules): string {
  return Buffer.from(
    JSON.stringify({ environment: flag.environment, key: flag.key })
  ).toString("base64url");
}

function decodeCursor(value: string): FlagCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as unknown;
    if (decoded === null || typeof decoded !== "object") {
      throw new Error("Cursor is not an object");
    }
    const record = decoded as { environment?: unknown; key?: unknown };
    if (
      typeof record.environment !== "string" ||
      record.environment.length === 0 ||
      typeof record.key !== "string" ||
      record.key.length === 0
    ) {
      throw new Error("Cursor is missing its sort key");
    }
    return { environment: record.environment, key: record.key };
  } catch (error) {
    throw new ValidationError(
      "The flag cursor is invalid.",
      [
        {
          name: "cursor",
          reason: "Use the nextCursor returned by the previous page.",
        },
      ],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED, cause: error }
    );
  }
}

function auditState(
  value: FlagRecord | null
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (toJsonInput(value) ?? Prisma.JsonNull);
}

interface AuditWrite {
  readonly flag: FlagWithRules;
  readonly before: FlagRecord | null;
  readonly after: FlagRecord;
  readonly reason: string;
  readonly actor: FlagActor;
}

async function writeAuditPair(
  tx: Prisma.TransactionClient,
  write: AuditWrite
): Promise<void> {
  await tx.featureFlagAuditLog.create({
    data: {
      flagId: write.flag.id,
      flagKey: write.flag.key,
      environment: write.flag.environment,
      actorUserId: write.actor.operatorId,
      actorEmail: null,
      source: "API",
      previousState: auditState(write.before),
      newState: auditState(write.after),
      reason: write.reason,
    },
  });
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: write.actor.operatorId,
    action:
      write.before === null
        ? PLATFORM_AUDIT_ACTIONS.FLAG_CREATED
        : PLATFORM_AUDIT_ACTIONS.FLAG_UPDATED,
    entityType: FLAG_ENTITY_TYPE,
    entityId: write.flag.id,
    organizationId: null,
    before: write.before,
    after: write.after,
    reason: write.reason,
    requestId: write.actor.requestId,
  });
}

/**
 * The flag mutation is already committed when the cache is invalidated. Redis
 * is a supporting dependency: its failure must not turn a committed write into
 * a 500, and the 300-second definition TTL bounds the staleness window.
 */
async function invalidateFlagCacheAfterCommit(
  flag: Pick<FeatureFlag, "environment" | "key">
): Promise<void> {
  try {
    await invalidateFlagCache(redis, flag.environment, flag.key);
  } catch (error) {
    logger.error(
      {
        error,
        flagKey: flag.key,
        environment: flag.environment,
      },
      FLAG_CACHE_INVALIDATION_FAILURE
    );
  }
}

function mapWriteError(error: unknown): unknown {
  if (isUniqueConstraintViolation(error)) {
    return new ConflictError(
      "A flag with this key already exists in this environment.",
      { code: PLATFORM_ERROR_CODE.FLAG_EXISTS }
    );
  }
  return error;
}

interface LifecycleFields {
  readonly owner: string | null;
  readonly expiresAt: string | null;
  readonly removalTicket: string | null;
}

function lifecycleFields(
  existing: FeatureFlag,
  input: UpdateFlagInput
): LifecycleFields {
  return {
    owner: input.owner ?? existing.owner,
    expiresAt: input.expiresAt ?? existing.expiresAt?.toISOString() ?? null,
    removalTicket: input.removalTicket ?? existing.removalTicket,
  };
}

/**
 * A legacy row without owner, expiry or removal ticket cannot be written at
 * all: the migration check is enforced on every update, so the service refuses
 * every update (disable included) until the operator supplies all three.
 */
export function assertLifecycleComplete(
  existing: FeatureFlag,
  input: UpdateFlagInput
): void {
  const fields = lifecycleFields(existing, input);
  if (
    fields.owner === null ||
    fields.expiresAt === null ||
    fields.removalTicket === null
  ) {
    throw new ConflictError(
      "This flag has no owner, expiry or removal ticket. Supply all three before changing it.",
      { code: PLATFORM_ERROR_CODE.FLAG_LIFECYCLE_INCOMPLETE }
    );
  }
}

export function assertNotExpiredWhenEnabled(
  existing: FeatureFlag,
  input: UpdateFlagInput
): void {
  const nextEnabled = input.isEnabled ?? existing.isEnabled;
  if (!nextEnabled) {
    return;
  }
  const fields = lifecycleFields(existing, input);
  if (fields.expiresAt !== null && isFlagExpired(fields.expiresAt)) {
    throw new ConflictError(
      "This flag has expired. Extend its expiry before enabling it.",
      { code: PLATFORM_ERROR_CODE.FLAG_EXPIRED }
    );
  }
}

function buildUpdatePatch(
  existing: FeatureFlag,
  input: UpdateFlagInput
): Prisma.FeatureFlagUpdateManyMutationInput {
  // Prisma ignores undefined fields, so the optional inputs can be mapped in
  // one declarative object. Adding a field is one line, not another branch.
  return {
    version: existing.version + 1,
    isEnabled: input.isEnabled,
    defaultEnabled: input.defaultEnabled,
    description: input.description,
    owner: input.owner,
    expiresAt: input.expiresAt === undefined ? undefined : new Date(input.expiresAt),
    removalTicket: input.removalTicket,
  };
}

function ruleRows(flagId: string, rules: readonly FlagRuleInput[]) {
  return rules.map((rule) => ({
    flagId,
    ruleType: rule.ruleType,
    targetId: rule.targetId,
    enabled: rule.enabled,
    priority: rule.priority,
  }));
}

export class AdminFlagsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listFlags(input: ListFlagsInput): Promise<FlagPage> {
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
    const where: Prisma.FeatureFlagWhereInput = {};
    if (input.environment !== undefined) {
      where.environment = input.environment;
    }
    if (cursor !== null) {
      if (
        input.environment !== undefined &&
        cursor.environment !== input.environment
      ) {
        throw new ValidationError(
          "The flag cursor belongs to another environment.",
          [
            {
              name: "cursor",
              reason: "Clear the cursor when changing the environment filter.",
            },
          ],
          { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
        );
      }
      if (input.environment !== undefined) {
        where.key = { gt: cursor.key };
      } else {
        where.OR = [
          { environment: { gt: cursor.environment } },
          { environment: cursor.environment, key: { gt: cursor.key } },
        ];
      }
    }

    const rows = await this.prisma.featureFlag.findMany({
      where,
      orderBy: [{ environment: "asc" }, { key: "asc" }],
      take: input.limit + 1,
      include: { rules: { orderBy: RULE_ORDER } },
    });
    const hasNextPage = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(serializeFlag),
      nextCursor:
        hasNextPage && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async createFlag(input: CreateFlagInput, actor: FlagActor): Promise<FlagRecord> {
    try {
      const flag = await this.prisma.$transaction(async (tx) => {
        const created = await tx.featureFlag.create({
          data: {
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            environment: input.environment,
            isEnabled: false,
            defaultEnabled: false,
            owner: input.owner,
            expiresAt: new Date(input.expiresAt),
            removalTicket: input.removalTicket,
          },
          include: { rules: true },
        });
        await writeAuditPair(tx, {
          flag: created,
          before: null,
          after: serializeFlag(created),
          reason: "Flag created via Platform API",
          actor,
        });
        return created;
      });

      await invalidateFlagCacheAfterCommit(flag);
      return serializeFlag(flag);
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async updateFlag(request: UpdateFlagRequest): Promise<FlagRecord> {
    const existing = await this.findFlagForUpdate(request.key, request.environment);
    this.assertExpectedVersion(existing, request.patch.expectedVersion);
    assertLifecycleComplete(existing, request.patch);
    assertNotExpiredWhenEnabled(existing, request.patch);
    if (request.patch.rules !== undefined) {
      await this.assertRuleTargets(request.patch.rules);
    }

    const updated = await this.applyFlagUpdate(
      existing,
      request.patch,
      request.actor
    );
    await invalidateFlagCacheAfterCommit(updated);
    return serializeFlag(updated);
  }

  private async findFlagForUpdate(
    key: string,
    environment: FlagEnvironment
  ): Promise<FlagWithRules> {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { environment_key: { environment, key } },
      include: { rules: { orderBy: RULE_ORDER } },
    });
    if (existing === null) {
      throw new NotFoundError("Feature flag '" + key + "' does not exist.", {
        code: PLATFORM_ERROR_CODE.FLAG_NOT_FOUND,
      });
    }
    return existing;
  }

  private assertExpectedVersion(existing: FeatureFlag, expectedVersion: number): void {
    if (existing.version !== expectedVersion) {
      throw new ConflictError(
        "Expected version " +
          expectedVersion +
          " but the current version is " +
          existing.version +
          ". Reload and retry.",
        { code: PLATFORM_ERROR_CODE.FLAG_VERSION_CONFLICT }
      );
    }
  }

  private async assertRuleTargets(rules: readonly FlagRuleInput[]): Promise<void> {
    const invalidEnvironment = rules.find(
      (rule) =>
        rule.ruleType === RULE_TYPES.ENVIRONMENT &&
        !(FLAG_ENVIRONMENTS as readonly string[]).includes(rule.targetId)
    );
    if (invalidEnvironment !== undefined) {
      throw new ValidationError(
        "Unknown environment target.",
        [
          {
            name: "rules",
            reason:
              "Environment targets must be one of " +
              FLAG_ENVIRONMENTS.join(", ") +
              ".",
          },
        ],
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
      );
    }

    const organizationIds = [
      ...new Set(
        rules
          .filter((rule) => rule.ruleType === RULE_TYPES.ORGANIZATION)
          .map((rule) => rule.targetId)
      ),
    ];
    if (organizationIds.length === 0) {
      return;
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "platform"."v_tenant_overview" WHERE "id" IN (${Prisma.join(
        organizationIds
      )})`
    );
    const found = new Set(rows.map((row) => row.id));
    const missing = organizationIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ValidationError(
        "Unknown tenant target.",
        missing.map((id) => ({
          name: "rules",
          reason: "Tenant " + id + " does not exist.",
        })),
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
      );
    }
  }

  private async applyFlagUpdate(
    existing: FlagWithRules,
    patch: UpdateFlagInput,
    actor: FlagActor
  ): Promise<FlagWithRules> {
    const data = buildUpdatePatch(existing, patch);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.featureFlag.updateMany({
        where: { id: existing.id, version: existing.version },
        data,
      });
      if (result.count === 0) {
        throw new ConflictError(
          "The flag changed while this request was in flight. Reload and retry.",
          { code: PLATFORM_ERROR_CODE.FLAG_VERSION_CONFLICT }
        );
      }
      if (patch.rules !== undefined) {
        await tx.featureFlagRule.deleteMany({ where: { flagId: existing.id } });
        if (patch.rules.length > 0) {
          await tx.featureFlagRule.createMany({
            data: ruleRows(existing.id, patch.rules),
          });
        }
      }
      const current = await tx.featureFlag.findUniqueOrThrow({
        where: { id: existing.id },
        include: { rules: { orderBy: RULE_ORDER } },
      });
      await writeAuditPair(tx, {
        flag: current,
        before: serializeFlag(existing),
        after: serializeFlag(current),
        reason: patch.reason ?? "Flag updated via Platform API",
        actor,
      });
      return current;
    });
  }
}

export function createAdminFlagsService(prisma: PrismaClient): AdminFlagsService {
  return new AdminFlagsService(prisma);
}
