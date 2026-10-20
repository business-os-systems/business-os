import { describe, it, expect, afterAll } from "vitest";
import {
  redis,
  redisHealthCheck,
  withDistributedLock,
  LockAcquisitionError,
  createCacheManager,
  formatTenantKey,
  createQueue,
  DEFAULT_DLQ_JOB_OPTIONS,
  closeRedis,
} from "../src/index.js";

describe("Redis & Distributed Mutex Engine (@suite/redis)", () => {
  afterAll(async () => {
    // Clean up test keys
    const testKeys = await redis.keys("test:*");
    const tenantKeys = await redis.keys("tenant:test_*");
    const lockKeys = await redis.keys("lock:test_*");
    const all = [...testKeys, ...tenantKeys, ...lockKeys];
    if (all.length > 0) {
      await redis.del(...all);
    }
    await closeRedis();
  });

  describe("1. Connection & Health Ping", () => {
    it("reports healthy connection with low latency ping", async () => {
      const health = await redisHealthCheck();
      expect(health.status).toBe("healthy");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });
  });

  describe("2. Distributed Lock Engine (withDistributedLock)", () => {
    it("acquires lock, executes operation, and releases atomically", async () => {
      const lockKey = "test_unit_lock_1";

      const result = await withDistributedLock(lockKey, 5000, async () => {
        // While inside lock, key exists in Redis
        const val = await redis.get(`lock:${lockKey}`);
        expect(val).toBeDefined();
        return "success_val";
      });

      expect(result).toBe("success_val");

      // After operation, lock is safely released
      const valAfter = await redis.get(`lock:${lockKey}`);
      expect(valAfter).toBeNull();
    });

    it("throws LockAcquisitionError if lock is already held", async () => {
      const lockKey = "test_contention_lock";

      // Hold lock in first call with a slow simulated operation
      let innerRan = false;
      const promise1 = withDistributedLock(lockKey, 3000, async () => {
        innerRan = true;
        await new Promise((r) => setTimeout(r, 300));
        return "first";
      });

      // Wait briefly so promise1 acquires lock
      await new Promise((r) => setTimeout(r, 50));

      // Attempt to acquire same lock simultaneously without retries
      await expect(
        withDistributedLock(lockKey, 1000, async () => "second", {
          retries: 0,
        })
      ).rejects.toThrow(LockAcquisitionError);

      const res1 = await promise1;
      expect(res1).toBe("first");
      expect(innerRan).toBe(true);
    });

    it("releases lock even if inner operation throws an error", async () => {
      const lockKey = "test_error_release_lock";

      await expect(
        withDistributedLock(lockKey, 5000, async () => {
          throw new Error("Simulated failure inside locked block");
        })
      ).rejects.toThrow("Simulated failure inside locked block");

      // Verify lock was released despite the throw
      const lockVal = await redis.get(`lock:${lockKey}`);
      expect(lockVal).toBeNull();

      // Subsequent acquisition must succeed
      const secondTry = await withDistributedLock(lockKey, 1000, async () => "recovered");
      expect(secondTry).toBe("recovered");
    });
  });

  describe("3. Tenant-Isolated Cache Manager", () => {
    const cache = createCacheManager();

    it("enforces tenant namespace prefixing on keys", () => {
      const key = formatTenantKey("org_hospitality_1", "room:101:status");
      expect(key).toBe("tenant:org_hospitality_1:room:101:status");
    });

    it("isolates cache data across different tenants", async () => {
      const tenantA = "test_org_alpha";
      const tenantB = "test_org_beta";
      const sharedKeyName = "config:branding";

      // Set data for Tenant A
      await cache.set(tenantA, sharedKeyName, { color: "blue", rate: 100 });

      // Set data for Tenant B
      await cache.set(tenantB, sharedKeyName, { color: "green", rate: 200 });

      // Retrieve each tenant's data
      const dataA = await cache.get<{ color: string; rate: number }>(tenantA, sharedKeyName);
      const dataB = await cache.get<{ color: string; rate: number }>(tenantB, sharedKeyName);

      expect(dataA).toEqual({ color: "blue", rate: 100 });
      expect(dataB).toEqual({ color: "green", rate: 200 });

      // Deleting Tenant A's key does not affect Tenant B
      await cache.del(tenantA, sharedKeyName);
      const dataAAfter = await cache.get(tenantA, sharedKeyName);
      const dataBAfter = await cache.get(tenantB, sharedKeyName);

      expect(dataAAfter).toBeNull();
      expect(dataBAfter).toEqual({ color: "green", rate: 200 });
    });

    it("invalidates keys by pattern using SCAN without cross-tenant impact", async () => {
      const tenantA = "test_org_hotel";
      const tenantB = "test_org_resort";

      // Populate multiple keys for Tenant A
      await cache.set(tenantA, "rooms:101", { occupied: true });
      await cache.set(tenantA, "rooms:102", { occupied: false });
      await cache.set(tenantA, "menu:lunch", { items: ["soup"] });

      // Populate matching key for Tenant B
      await cache.set(tenantB, "rooms:101", { occupied: false });

      // Invalidate all rooms for Tenant A
      await cache.invalidatePattern(tenantA, "rooms:*");

      // Verify Tenant A rooms are invalidated
      expect(await cache.get(tenantA, "rooms:101")).toBeNull();
      expect(await cache.get(tenantA, "rooms:102")).toBeNull();

      // Tenant A non-matching key is preserved
      expect(await cache.get(tenantA, "menu:lunch")).toEqual({ items: ["soup"] });

      // Tenant B's room key is untouched!
      expect(await cache.get(tenantB, "rooms:101")).toEqual({ occupied: false });
    });

    it("transparently caches and returns result using getOrSet (Issue 53)", async () => {
      const tenant = "test_org_cache_aside";
      const key = "role:permissions:cashier";
      let computeCount = 0;

      const fetcher = async () => {
        computeCount++;
        return ["pos:orders:create", "pos:orders:read"];
      };

      // First call executes fetcher and populates cache
      const result1 = await cache.getOrSet(tenant, key, fetcher, 60);
      expect(result1).toEqual(["pos:orders:create", "pos:orders:read"]);
      expect(computeCount).toBe(1);

      // Second call returns from cache without executing fetcher
      const result2 = await cache.getOrSet(tenant, key, fetcher, 60);
      expect(result2).toEqual(["pos:orders:create", "pos:orders:read"]);
      expect(computeCount).toBe(1);

      // Cleanup
      await cache.del(tenant, key);
    });
  });

  describe("4. BullMQ Queue & Worker Instantiation", () => {
    it("configures standard DLQ retry policy on queues", () => {
      const queue = createQueue("test-audit-queue");

      expect(queue.name).toBe("test-audit-queue");
      expect(DEFAULT_DLQ_JOB_OPTIONS.attempts).toBe(3);
      expect(DEFAULT_DLQ_JOB_OPTIONS.backoff).toEqual({
        type: "exponential",
        delay: 1000,
      });
      expect(DEFAULT_DLQ_JOB_OPTIONS.removeOnFail).toBe(false);

      // Close test queue
      void queue.close();
    });

    it("enqueues transactional email to email-queue asynchronously (Issue 54)", async () => {
      const { enqueueEmail, EMAIL_QUEUE_NAME, getEmailQueue } = await import("../src/index.js");

      expect(EMAIL_QUEUE_NAME).toBe("email-queue");

      const jobId = await enqueueEmail({
        to: "guest@riverview.com",
        subject: "Reservation Confirmed",
        html: "<p>Thank you for booking.</p>",
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");

      const queue = getEmailQueue();
      const job = await queue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job?.data.to).toBe("guest@riverview.com");
      expect(job?.data.subject).toBe("Reservation Confirmed");

      // Clean up job
      await job?.remove();
    });
  });
});
