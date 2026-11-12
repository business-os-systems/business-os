import client from "prom-client";
import { metricsRegistry } from "../../telemetry.js";

/**
 * Creation-to-publish funnel (SC-010, T174).
 *
 * A merchant succeeds on the first attempt when a created site reaches a
 * published release without a second workspace or a support intervention. The
 * funnel records each stage once per event, so completion is
 * published / created on the same metric. Labels carry no tenant or site id
 * (OP-11); the stage registry is closed so an unregistered stage fails to
 * compile.
 */
export const CREATION_FUNNEL_STAGES = {
  SITE_CREATED: "site_created",
  REVIEW_OPENED: "review_opened",
  SITE_PUBLISHED: "site_published",
} as const;

export type CreationFunnelStage =
  (typeof CREATION_FUNNEL_STAGES)[keyof typeof CREATION_FUNNEL_STAGES];

export const creationFunnelCounter = new client.Counter({
  name: "suite_cms_creation_funnel_total",
  help: "Website Builder creation-to-publish funnel events by stage",
  labelNames: ["stage"],
  registers: [metricsRegistry],
});

export function recordCreationFunnelStage(stage: CreationFunnelStage): void {
  creationFunnelCounter.inc({ stage });
}
