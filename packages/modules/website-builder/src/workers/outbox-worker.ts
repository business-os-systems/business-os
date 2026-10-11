import { OutboxRecord } from "../events/outbox-writer.js";

export interface OutboxProcessingResult {
  recordId: string;
  success: boolean;
  dispatchedTo: string[];
  error?: string;
  isDeadLetter: boolean;
}

export class OutboxWorker {
  private readonly maxRetries = 5;

  /**
   * Processes an outbox event record, executing domain-specific dispatchers
   */
  public async processRecord(
    record: OutboxRecord
  ): Promise<OutboxProcessingResult> {
    const dispatchedTo: string[] = [];

    try {
      switch (record.eventName) {
        case "cms.page.published":
          // Dispatch to CDN purge dispatcher & sitemap generator
          dispatchedTo.push("edge_cdn_cache_purge", "sitemap_generator");
          break;

        case "cms.page.unpublished":
          dispatchedTo.push("edge_cdn_cache_purge");
          break;

        case "cms.form.submitted":
          // Dispatch to CRM lead pipeline and transactional notification queue
          dispatchedTo.push("crm_lead_pipeline", "notification_dispatcher");
          break;

        case "cms.domain.verified":
          // Dispatch to SSL provisioning edge queue
          dispatchedTo.push("ssl_cert_provisioner");
          break;

        default:
          throw new Error(`Unhandled event type: ${record.eventName}`);
      }

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
