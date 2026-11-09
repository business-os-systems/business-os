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
  CATALOG_CACHE_KEY_PREFIX,
  CATALOG_CACHE_DEFAULT_TTL_SECONDS,
  CATALOG_CACHE_INVALIDATION_TRIGGER,
  CATALOG_CACHE_POLICY,
  catalogCacheKey,
  createCatalogCache,
  type CatalogCache,
  type CatalogCacheClient,
  type CatalogCacheKey,
  type ReadCatalogCacheOptions,
  type WriteCatalogCacheOptions,
} from "./catalog-cache.js";

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
export {
  PLATFORM_OUTBOX_MAX_ATTEMPTS,
  PLATFORM_OUTBOX_POLL_INTERVAL_MS,
  PLATFORM_OUTBOX_LEASE_SECONDS,
  platformOutboxBackoffMs,
  createPlatformOutboxDispatcher,
  type PlatformOutboxEvent,
  type PlatformOutboxStore,
  type PlatformOutboxHandler,
  type PlatformOutboxHandlers,
  type PlatformOutboxDispatcher,
  type CreatePlatformOutboxDispatcherOptions,
} from "./platform-outbox.js";
export {
  IDEMPOTENCY_TTL_SECONDS,
  IDEMPOTENCY_PENDING_TTL_SECONDS,
  IDEMPOTENCY_KEY_PREFIX,
  IDEMPOTENCY_HEADER,
  createIdempotencyStore,
  type IdempotentResponse,
  type IdempotencyReservation,
  type IdempotencyStore,
} from "./idempotency.js";
