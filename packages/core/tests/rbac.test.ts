import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  SUPERUSER_WILDCARD,
  evaluateBranchAccess,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  matchPermission,
  requirePermission,
  resolveBranchPermissions,
} from "../src/index.js";

describe("@suite/core - Hierarchical RBAC Permission Evaluator", () => {
  describe("Permission Pattern Matching", () => {
    it("matches exact permissions", () => {
      expect(matchPermission("pms:reservations:read", "pms:reservations:read")).toBe(true);
      expect(matchPermission("pms:reservations:read", "pms:reservations:write")).toBe(false);
    });

    it("matches root superuser wildcard (*)", () => {
      expect(matchPermission(SUPERUSER_WILDCARD, "pms:reservations:read")).toBe(true);
      expect(matchPermission(SUPERUSER_WILDCARD, "admin:system:database:drop")).toBe(true);
    });

    it("matches module-level namespace wildcards (e.g. pms:*)", () => {
      expect(matchPermission("pms:*", "pms:reservations:read")).toBe(true);
      expect(matchPermission("pms:*", "pms:folios:write")).toBe(true);
      expect(matchPermission("pms:*", "pms:night-audit:execute")).toBe(true);
      expect(matchPermission("pms:*", "pos:orders:create")).toBe(false);
    });

    it("matches nested resource-level wildcards (e.g. pms:reservations:*)", () => {
      expect(matchPermission("pms:reservations:*", "pms:reservations:read")).toBe(true);
      expect(matchPermission("pms:reservations:*", "pms:reservations:write")).toBe(true);
      expect(matchPermission("pms:reservations:*", "pms:reservations:delete")).toBe(true);
      expect(matchPermission("pms:reservations:*", "pms:folios:read")).toBe(false);
    });
  });

  describe("Set-based Permission Checks", () => {
    const cashierPerms = ["pos:orders:create", "pos:orders:read", "pos:payments:read"];

    it("evaluates hasPermission correctly", () => {
      expect(hasPermission(cashierPerms, "pos:orders:create")).toBe(true);
      expect(hasPermission(cashierPerms, "pos:orders:void")).toBe(false);
      expect(hasPermission([], "pos:orders:create")).toBe(false);
    });

    it("evaluates hasAllPermissions correctly", () => {
      expect(hasAllPermissions(cashierPerms, ["pos:orders:create", "pos:orders:read"])).toBe(true);
      expect(hasAllPermissions(cashierPerms, ["pos:orders:create", "pos:orders:void"])).toBe(false);
      expect(hasAllPermissions(cashierPerms, [])).toBe(true);
    });

    it("evaluates hasAnyPermission correctly", () => {
      expect(hasAnyPermission(cashierPerms, ["pos:orders:void", "pos:orders:create"])).toBe(true);
      expect(hasAnyPermission(cashierPerms, ["pms:reservations:read", "pos:orders:void"])).toBe(false);
    });

    it("requirePermission asserts without throwing on valid permissions", () => {
      expect(() => requirePermission(cashierPerms, "pos:orders:create")).not.toThrow();
    });

    it("requirePermission throws ForbiddenError on missing permissions", () => {
      expect(() => requirePermission(cashierPerms, "pos:orders:void")).toThrow(ForbiddenError);
    });
  });

  describe("Multi-Branch Security Scope Resolution", () => {
    const roleRegistry = {
      FRONT_DESK_AGENT: ["pms:reservations:read", "pms:reservations:write", "pms:guests:read"],
      POS_CASHIER: ["pos:orders:create", "pos:orders:read", "pos:payments:read"],
    };

    it("grants full superuser access to System Administrators", () => {
      const sysAdminCtx = {
        userId: "usr_admin",
        organizationId: "org_master",
        isSystemAdmin: true,
      };

      const perms = resolveBranchPermissions(sysAdminCtx, "branch_any", roleRegistry);
      expect(perms).toContain("*");
      expect(evaluateBranchAccess(sysAdminCtx, "branch_any", "any:privilege:action", roleRegistry)).toBe(true);
    });

    it("grants wildcard access across all branches to Organization Owners", () => {
      const ownerCtx = {
        userId: "usr_owner",
        organizationId: "org_riverview",
        organizationRoles: ["ORG_OWNER"],
      };

      expect(evaluateBranchAccess(ownerCtx, "branch_south", "pms:night-audit:execute", roleRegistry)).toBe(true);
      expect(evaluateBranchAccess(ownerCtx, "branch_north", "pos:system:configure", roleRegistry)).toBe(true);
    });

    it("correctly isolates permissions by target branch for branch staff", () => {
      const staffCtx = {
        userId: "usr_staff",
        organizationId: "org_riverview",
        branchRoles: {
          branch_south: ["FRONT_DESK_AGENT"],
          branch_north: ["POS_CASHIER"],
        },
      };

      // In branch_south, user can read reservations, but cannot create POS orders
      expect(evaluateBranchAccess(staffCtx, "branch_south", "pms:reservations:read", roleRegistry)).toBe(true);
      expect(evaluateBranchAccess(staffCtx, "branch_south", "pos:orders:create", roleRegistry)).toBe(false);

      // In branch_north, user can create POS orders, but cannot read reservations
      expect(evaluateBranchAccess(staffCtx, "branch_north", "pos:orders:create", roleRegistry)).toBe(true);
      expect(evaluateBranchAccess(staffCtx, "branch_north", "pms:reservations:read", roleRegistry)).toBe(false);

      // In an unassigned branch_east, user has zero access
      expect(evaluateBranchAccess(staffCtx, "branch_east", "pms:reservations:read", roleRegistry)).toBe(false);
    });
  });
});
