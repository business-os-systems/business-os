import { describe, expect, it } from "vitest";
import {
  BLOCKING_TENANT_STATUSES,
  TENANT_LIFECYCLE_ACTIONS,
  TENANT_LIFECYCLE_EVENT_TYPES,
  TENANT_STATUSES,
  canApplyLifecycleAction,
  getTenantLifecycleTransition,
  isBlockingTenantStatus,
  isTenantStatus,
  normalizeTenantStatus,
  resolveRestoreTarget,
} from "../src/index.js";

describe("@suite/core - tenant lifecycle registry", () => {
  it("registers an event type and transition for every action", () => {
    for (const action of TENANT_LIFECYCLE_ACTIONS) {
      const transition = getTenantLifecycleTransition(action);
      expect(transition.action).toBe(action);
      expect(transition.eventType).toBe(TENANT_LIFECYCLE_EVENT_TYPES[action]);
      expect(transition.eventType.startsWith("platform.tenant.")).toBe(true);
      expect(transition.allowedFrom.length).toBeGreaterThan(0);
    }
  });

  it("never allows a transition into the status it starts from", () => {
    for (const action of TENANT_LIFECYCLE_ACTIONS) {
      const transition = getTenantLifecycleTransition(action);
      for (const from of transition.allowedFrom) {
        if (transition.targetStatus !== null) {
          expect(canApplyLifecycleAction(action, from)).toBe(true);
          expect(from).not.toBe(transition.targetStatus);
        }
      }
    }
  });

  it("only suspends a workspace that is not already blocked", () => {
    const transition = getTenantLifecycleTransition("SUSPEND");
    expect(transition.allowedFrom).toEqual(["TRIAL", "ACTIVE", "PAST_DUE"]);
    expect(transition.allowedFrom).not.toContain("SUSPENDED");
    expect(transition.allowedFrom).not.toContain("ARCHIVED");
  });

  it("restores only a suspended workspace, back to a live status", () => {
    const restore = getTenantLifecycleTransition("RESTORE");
    expect(restore.allowedFrom).toEqual(["SUSPENDED"]);
    expect(restore.targetStatus).toBeNull();
    expect(resolveRestoreTarget("ACTIVE")).toBe("ACTIVE");
    expect(resolveRestoreTarget("PAST_DUE")).toBe("PAST_DUE");
    expect(resolveRestoreTarget("ARCHIVED")).toBeNull();
    expect(resolveRestoreTarget("SUSPENDED")).toBeNull();
  });

  it("requires a slug confirmation only for archive", () => {
    expect(getTenantLifecycleTransition("ARCHIVE").requiresConfirmationSlug).toBe(true);
    expect(getTenantLifecycleTransition("SUSPEND").requiresConfirmationSlug).toBe(false);
    expect(getTenantLifecycleTransition("RESTORE").requiresConfirmationSlug).toBe(false);
  });

  it("recognizes the canonical statuses and no others", () => {
    for (const status of TENANT_STATUSES) {
      expect(isTenantStatus(status)).toBe(true);
      expect(normalizeTenantStatus(` ${status.toLowerCase()} `)).toBe(status);
    }
    expect(isTenantStatus("DELETED")).toBe(false);
    expect(normalizeTenantStatus("deleted")).toBeNull();
  });

  it("treats suspension and archival as the only blocking statuses", () => {
    expect([...BLOCKING_TENANT_STATUSES]).toEqual(["SUSPENDED", "ARCHIVED"]);
    expect(isBlockingTenantStatus("SUSPENDED")).toBe(true);
    expect(isBlockingTenantStatus("ARCHIVED")).toBe(true);
    expect(isBlockingTenantStatus("ACTIVE")).toBe(false);
    expect(isBlockingTenantStatus("TRIAL")).toBe(false);
    expect(isBlockingTenantStatus("PAST_DUE")).toBe(false);
  });
});
