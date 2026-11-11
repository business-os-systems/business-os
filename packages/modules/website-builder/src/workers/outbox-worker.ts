import { OutboxRecord } from "../events/outbox-writer.js";

export interface OutboxProcessingResult {
  recordId: string;
  success: boolean;
  dispatchedTo: string[];
  error?: string;
  isDeadLetter: boolean;
}

export interface IEventDispatcher {
  dispatch(record: OutboxRecord): Promise<string[]> | string[];
}

export const EVENT_DISPATCHERS: Record<string, IEventDispatcher> = {
  "cms.page.published": {
    dispatch: () => ["edge_cdn_cache_purge", "sitemap_generator"],
  },
  "cms.page.unpublished": {
    dispatch: () => ["edge_cdn_cache_purge"],
  },
  "cms.form.submitted": {
    // FR-138: release one records the lead and never sends a message.
    dispatch: () => ["crm_lead_pipeline"],
  },
  "cms.domain.verified": {
    dispatch: () => ["ssl_cert_provisioner"],
  },
};

export class OutboxWorker {
  private readonly maxRetries = 5;
  private readonly dispatchers: Record<string, IEventDispatcher>;

  constructor(dispatchers: Record<string, IEventDispatcher> = EVENT_DISPATCHERS) {
    this.dispatchers = dispatchers;
  }

  /**
   * Processes an outbox event record, executing domain-specific dispatchers
   */
  public async processRecord(
    record: OutboxRecord
  ): Promise<OutboxProcessingResult> {
    const dispatchedTo: string[] = [];

    try {
      const dispatcher = this.dispatchers[record.eventName];
      if (!dispatcher) {
        throw new Error(`Unhandled event type: ${record.eventName}`);
      }

      const targets = await dispatcher.dispatch(record);
      dispatchedTo.push(...targets);

      return {
        recordId: record.id,
        success: true,
        dispatchedTo,
        isDeadLetter: false,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown dispatch error";
      const isDeadLetter = record.retryCount + 1 >= this.maxRetries;

      return {
        recordId: record.id,
        success: false,
        dispatchedTo,
        error: errorMessage,
        isDeadLetter,
      };
    }
  }

  /**
   * Calculates exponential backoff delay with jitter (in milliseconds)
   */
  public calculateBackoffDelayMs(attempt: number): number {
    const baseDelay = 1000; // 1s
    const maxDelay = 30000; // 30s
    const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
    const jitter = Math.random() * 0.2 * exponential;
    return Math.floor(exponential + jitter);
  }
}
