import { randomUUID } from "node:crypto";
import {
  CmsEventEnvelope,
  CmsEventEnvelopeSchema,
  CmsEventName,
} from "./catalog.js";

export interface OutboxRecord {
  id: string;
  eventName: string;
  aggregateId: string;
  organizationId: string;
  siteId: string;
  payload: CmsEventEnvelope;
  status: "PENDING" | "PROCESSED" | "FAILED";
  retryCount: number;
  createdAt: string;
}

export interface IOutboxWriter {
  stageEvent<T extends Record<string, unknown>>(params: {
    eventName: CmsEventName;
    aggregateId: string;
    organizationId: string;
    siteId: string;
    schemaVersion: number;
    data: T;
  }): OutboxRecord;
}

export class OutboxWriter implements IOutboxWriter {
  /**
   * Stages a domain event into the transactional outbox payload format
   * In production, this object is saved directly into the database within an active Prisma transaction ($transaction)
   */
  public stageEvent<T extends Record<string, unknown>>(params: {
    eventName: CmsEventName;
    aggregateId: string;
    organizationId: string;
    siteId: string;
    schemaVersion: number;
    data: T;
  }): OutboxRecord {
    const envelope: CmsEventEnvelope = {
      id: randomUUID(),
      type: params.eventName,
      source: "app.website-builder",
      organizationId: params.organizationId,
      siteId: params.siteId,
      schemaVersion: params.schemaVersion,
      data: params.data,
      timestamp: new Date().toISOString(),
    };

    // Strict validation against CloudEvents envelope
    CmsEventEnvelopeSchema.parse(envelope);

    return {
      id: randomUUID(),
      eventName: params.eventName,
      aggregateId: params.aggregateId,
      organizationId: params.organizationId,
      siteId: params.siteId,
      payload: envelope,
      status: "PENDING",
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
  }
}
