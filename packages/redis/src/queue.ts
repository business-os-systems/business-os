import {
  Queue,
  Worker,
  type QueueOptions,
  type WorkerOptions,
  type Processor,
  type JobsOptions,
} from "bullmq";
import type { Redis } from "ioredis";
import { redis as defaultRedis } from "./client.js";

/**
 * Standard Dead-Letter-Queue (DLQ) and retry policy for all suite background jobs:
 * - 3 retries with exponential backoff (1s -> 2s -> 4s)
 * - Retains failed jobs in DLQ state for audit/inspection
 * - Cleans up completed jobs to prevent memory bloat
 */
export const DEFAULT_DLQ_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false, // Keep in failed state for dead-letter review
};

/**
 * Creates a BullMQ Queue instance with standard connection and retry defaults.
 */
export function createQueue<DataType = unknown, ResultType = unknown>(
  name: string,
  options: Partial<QueueOptions> = {},
  connection: Redis = defaultRedis
): Queue<DataType, ResultType> {
  return new Queue<DataType, ResultType>(name, {
    connection,
    defaultJobOptions: {
      ...DEFAULT_DLQ_JOB_OPTIONS,
      ...options.defaultJobOptions,
    },
    ...options,
  });
}

/**
 * Creates a BullMQ Worker instance with standard connection defaults.
 */
export function createWorker<DataType = unknown, ResultType = unknown>(
  name: string,
  processor: Processor<DataType, ResultType>,
  options: Partial<WorkerOptions> = {},
  connection: Redis = defaultRedis
): Worker<DataType, ResultType> {
  return new Worker<DataType, ResultType>(name, processor, {
    connection,
    concurrency: options.concurrency ?? 5,
    ...options,
  });
}

export const EMAIL_QUEUE_NAME = "email-queue";

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  organizationId?: string;
}

let emailQueueSingleton: Queue<EmailJobPayload> | null = null;

export function getEmailQueue(connection: Redis = defaultRedis): Queue<EmailJobPayload> {
  if (!emailQueueSingleton) {
    emailQueueSingleton = createQueue<EmailJobPayload>(EMAIL_QUEUE_NAME, {}, connection);
  }
  return emailQueueSingleton;
}

/**
 * Enqueues an email job into the BullMQ background email queue (Issue 54).
 * Returns the enqueued BullMQ job ID.
 */
export async function enqueueEmail(
  payload: EmailJobPayload,
  connection: Redis = defaultRedis
): Promise<string> {
  const queue = getEmailQueue(connection);
  const job = await queue.add("send-email", payload);
  return job.id ?? "";
}
