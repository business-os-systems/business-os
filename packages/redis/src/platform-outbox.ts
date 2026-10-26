export const PLATFORM_OUTBOX_MAX_ATTEMPTS = 5;
export const PLATFORM_OUTBOX_POLL_INTERVAL_MS = 1000;
export const PLATFORM_OUTBOX_LEASE_SECONDS = 60;

export interface PlatformOutboxEvent {
  readonly id: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface PlatformOutboxStore {
  claimNext(now: Date): Promise<PlatformOutboxEvent | null>;
  markDone(id: string, now: Date): Promise<void>;
  markRetry(
    id: string,
    attempts: number,
    availableAt: Date,
    error: string
  ): Promise<void>;
  markDead(id: string, error: string): Promise<void>;
}

export type PlatformOutboxHandler = (
  event: PlatformOutboxEvent
) => Promise<void>;

export type PlatformOutboxHandlers = Readonly<
  Record<string, PlatformOutboxHandler>
>;

export function platformOutboxBackoffMs(attempts: number): number {
  const baseDelayMs = 1000;
  const maximumDelayMs = 30_000;
  return Math.min(
    maximumDelayMs,
    baseDelayMs * 2 ** Math.max(0, attempts - 1)
  );
}

export interface PlatformOutboxDispatcher {
  dispatchOnce(): Promise<boolean>;
}

export interface CreatePlatformOutboxDispatcherOptions {
  readonly store: PlatformOutboxStore;
  readonly handlers: PlatformOutboxHandlers;
  readonly now?: () => Date;
}

/**
 * Claims one event, dispatches it to its handler, and records the outcome.
 * Unknown event types are skipped and marked done so they cannot block the queue.
 */
export function createPlatformOutboxDispatcher(
  options: CreatePlatformOutboxDispatcherOptions
): PlatformOutboxDispatcher {
  const now = options.now ?? (() => new Date());

  return {
    async dispatchOnce(): Promise<boolean> {
      const event = await options.store.claimNext(now());
      if (event === null) {
        return false;
      }

      const handler = options.handlers[event.eventType];
      if (handler === undefined) {
        console.warn(
          `[platform-outbox] no handler for "${event.eventType}"; marking done`
        );
        await options.store.markDone(event.id, now());
        return true;
      }

      try {
        await handler(event);
        await options.store.markDone(event.id, now());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (event.attempts >= PLATFORM_OUTBOX_MAX_ATTEMPTS) {
          await options.store.markDead(event.id, message);
        } else {
          await options.store.markRetry(
            event.id,
            event.attempts,
            new Date(
              now().getTime() + platformOutboxBackoffMs(event.attempts)
            ),
            message
          );
        }
      }

      return true;
    },
  };
}
