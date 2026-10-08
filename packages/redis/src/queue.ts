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
