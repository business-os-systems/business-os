import {
  Prisma,
  type OutboxEvent,
  type PrismaClient,
} from "@suite/db";
import {
  PLATFORM_OUTBOX_LEASE_SECONDS,
  PLATFORM_OUTBOX_POLL_INTERVAL_MS,
  createPlatformOutboxDispatcher,
  type PlatformOutboxEvent,
  type PlatformOutboxHandlers,
  type PlatformOutboxStore,
} from "@suite/redis";

export interface AppendPlatformOutboxEventInput {
  readonly eventType: string;
  readonly payload: Prisma.InputJsonValue;
  readonly availableAt?: Date;
}

/**
 * Writes an outbox event in the caller's transaction. The state change and its
 * event commit together, or neither does.
 */
export async function appendPlatformOutboxEvent(
  tx: Prisma.TransactionClient,
  input: AppendPlatformOutboxEventInput
): Promise<OutboxEvent> {
  const now = new Date();
  return tx.outboxEvent.create({
    data: {
      eventType: input.eventType,
      payload: input.payload,
      status: "PENDING",
      attempts: 0,
      availableAt: input.availableAt ?? now,
      createdAt: now,
    },
  });
}

export function createPlatformOutboxStore(
  prisma: PrismaClient
): PlatformOutboxStore {
  return {
    async claimNext(now: Date): Promise<PlatformOutboxEvent | null> {
      const leaseUntil = new Date(
        now.getTime() + PLATFORM_OUTBOX_LEASE_SECONDS * 1000
      );
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          eventType: string;
          payload: unknown;
          attempts: number;
        }>
      >(Prisma.sql`
        UPDATE "platform"."outbox_events"
        SET "status" = 'PROCESSING', "attempts" = "attempts" + 1,
            "availableAt" = ${leaseUntil}
        WHERE "id" = (
          SELECT "id"
          FROM "platform"."outbox_events"
          WHERE "status" IN ('PENDING', 'PROCESSING')
            AND "availableAt" <= ${now}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING "id", "eventType", "payload", "attempts"
      `);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            eventType: row.eventType,
            payload: row.payload,
            attempts: row.attempts,
          };
    },

    async markDone(id: string, now: Date): Promise<void> {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: "DONE", processedAt: now, lastError: null },
      });
    },

    async markRetry(
      id: string,
      _attempts: number,
      availableAt: Date,
      error: string
    ): Promise<void> {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: "PENDING", availableAt, lastError: error },
      });
    },

    async markDead(id: string, error: string): Promise<void> {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: "DEAD", processedAt: new Date(), lastError: error },
      });
    },
  };
}

export interface PlatformOutboxWorkerOptions {
  readonly prisma: PrismaClient;
  readonly handlers: PlatformOutboxHandlers;
  readonly intervalMs?: number;
}

export interface PlatformOutboxWorkerHandle {
  stop(): void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts the polling loop. The caller owns the lifecycle and should stop it on
 * shutdown. Unknown event types are skipped and marked done.
 */
export function startPlatformOutboxWorker(
  options: PlatformOutboxWorkerOptions
): PlatformOutboxWorkerHandle {
  const dispatcher = createPlatformOutboxDispatcher({
    store: createPlatformOutboxStore(options.prisma),
    handlers: options.handlers,
  });
  const intervalMs = options.intervalMs ?? PLATFORM_OUTBOX_POLL_INTERVAL_MS;
  let stopped = false;

  const run = async (): Promise<void> => {
    while (!stopped) {
      try {
        await dispatcher.dispatchOnce();
      } catch (error) {
        console.error("[platform-outbox] dispatcher iteration failed", error);
      }
      if (!stopped) {
        await delay(intervalMs);
      }
    }
  };

  void run();

  return {
    stop(): void {
      stopped = true;
    },
  };
}
