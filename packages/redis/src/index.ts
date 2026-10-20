export {
  redis,
  createRedisClient,
  redisHealthCheck,
  closeRedis,
  type RedisHealthResult,
} from "./client.js";

export {
  withDistributedLock,
  LockAcquisitionError,
  acquireLock,
  releaseLock,
  type LockOptions,
} from "./lock.js";

export {
  createCacheManager,
  cacheManager,
  formatTenantKey,
  type CacheManager,
} from "./cache.js";

export {
  createQueue,
  createWorker,
  DEFAULT_DLQ_JOB_OPTIONS,
  EMAIL_QUEUE_NAME,
  getEmailQueue,
  enqueueEmail,
  type EmailJobPayload,
} from "./queue.js";

export {
  checkRateLimit,
  type RateLimitRule,
  type RateLimitResult,
} from "./rate-limiter.js";

export { Redis, type RedisOptions } from "ioredis";
export {
  Queue,
  Worker,
  Job,
  type QueueOptions,
  type WorkerOptions,
  type Processor,
  type JobsOptions,
} from "bullmq";
