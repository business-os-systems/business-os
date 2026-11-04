import { z } from "zod";
import {
  TENANT_LIFECYCLE_EVENT_TYPES,
  TENANT_LIFECYCLE_REASON_CODES,
  TENANT_STATUSES,
} from "./transitions.js";

const eventTypeValues = [
  TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND,
  TENANT_LIFECYCLE_EVENT_TYPES.RESTORE,
  TENANT_LIFECYCLE_EVENT_TYPES.ARCHIVE,
] as const;

const reasonCodeValues = [
  TENANT_LIFECYCLE_REASON_CODES.SUSPEND,
  TENANT_LIFECYCLE_REASON_CODES.RESTORE,
  TENANT_LIFECYCLE_REASON_CODES.ARCHIVE,
] as const;

/**
 * The published lifecycle event (contracts/events.md) as a runtime contract.
 * The producer builds against this schema and the consumer parses with it, so
 * neither side can drift from the documented envelope. The payload never
 * carries the operator's free-text reason, which is why the data has no
 * reason field - only the canonical code.
 */
export const tenantLifecycleEventDataSchema = z.union([
  z
    .object({
      fromStatus: z.enum(TENANT_STATUSES),
      toStatus: z.enum(TENANT_STATUSES),
      reasonCode: z.enum(reasonCodeValues),
    })
    .strict(),
  z
    .object({
      fromStatus: z.enum(TENANT_STATUSES),
      toStatus: z.enum(TENANT_STATUSES),
    })
    .strict(),
]);

export const tenantLifecycleEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(eventTypeValues),
    version: z.literal(1),
    occurredAt: z.string().datetime(),
    actor: z.object({
      type: z.literal("operator"),
      id: z.string().min(1),
    }),
    organizationId: z.string().min(1),
    correlationId: z.string().min(1),
    data: tenantLifecycleEventDataSchema,
  })
  .strict();

export type TenantLifecycleEvent = z.infer<typeof tenantLifecycleEventSchema>;
