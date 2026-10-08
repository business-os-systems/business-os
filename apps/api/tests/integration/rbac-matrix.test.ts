import { describe, it, expect } from "vitest";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  requirePermission,
  matchPermission,
  resolveBranchPermissions,
  evaluateBranchAccess,
  type UserSecurityContext,
  type RolePermissionMapping,
} from "@suite/core";
import { ForbiddenError } from "@suite/core/errors";

describe("Integration: Enterprise RBAC Matrix & Access Control", () => {
  // Master RBAC Role to Permission Mapping
  const rolePermissions: RolePermissionMapping = {
    POS_CASHIER: [
      "pos:orders:read",
      "pos:orders:create",
      "pos:payments:process",
      "inventory:stock:read",
    ],
    SHIFT_SUPERVISOR: [
      "pos:orders:read",
      "pos:orders:create",
      "pos:orders:void",
      "pos:payments:process",
      "pos:discounts:apply",
      "shift:terminal:open",
      "shift:terminal:close",
      "inventory:stock:read",
    ],
    BRANCH_MANAGER: [
      "pos:*",
      "pms:*",
      "shift:*",
      "inventory:*",
      "branch:reports:read",
      "branch:staff:read",
      "branch:staff:assign",
      "finance:refunds:approve",
      "manager:override:pin",
    ],
    ORG_ADMIN: [
      "org:*",
      "branch:*",
      "pos:*",
      "pms:*",
      "shift:*",
      "finance:*",
      "inventory:*",
      "reports:*",
      "users:*",
    ],
  };

  const cashierContext: UserSecurityContext = {
    userId: "user_cashier_001",
    organizationId: "org_riverview_01",
    branchRoles: {
      branch_delhi: ["POS_CASHIER"],
    },
  };

  const supervisorContext: UserSecurityContext = {
    userId: "user_supervisor_002",
    organizationId: "org_riverview_01",
    branchRoles: {
      branch_delhi: ["SHIFT_SUPERVISOR"],
    },
  };

  const managerContext: UserSecurityContext = {
    userId: "user_manager_003",
    organizationId: "org_riverview_01",
    branchRoles: {
      branch_delhi: ["BRANCH_MANAGER"],
    },
  };

  const orgAdminContext: UserSecurityContext = {
    userId: "user_admin_004",
    organizationId: "org_riverview_01",
    organizationRoles: ["ORG_ADMIN"],
  };

  const superAdminContext: UserSecurityContext = {
    userId: "user_super_005",
    organizationId: "org_master_00",
    isSystemAdmin: true,
  };

  describe("Permission Matching Engine (matchPermission & hasPermission)", () => {
    it("evaluates exact matching", () => {
      expect(matchPermission("pos:orders:create", "pos:orders:create")).toBe(true);
      expect(matchPermission("pos:orders:create", "pos:orders:delete")).toBe(false);
    });

    it("evaluates permission list checks with hasPermission", () => {
      const perms = ["pos:orders:read", "pos:orders:create"];
      expect(hasPermission(perms, "pos:orders:read")).toBe(true);
      expect(hasPermission(perms, "pos:orders:delete")).toBe(false);
    });

    it("evaluates wildcard permissions", () => {
      expect(matchPermission("*", "anything:at:all")).toBe(true);
      expect(matchPermission("pos:*", "pos:orders:read")).toBe(true);
      expect(matchPermission("pos:*", "pos:payments:refund")).toBe(true);
      expect(matchPermission("pos:*", "finance:tax:configure")).toBe(false);
    });
  });

  describe("Cashier vs Manager Access Enforcement", () => {
    it("permits Cashier to process payments and read orders", () => {
      const canRead = evaluateBranchAccess(
        cashierContext,
        "branch_delhi",
        "pos:orders:read",
        rolePermissions
      );
      const canPay = evaluateBranchAccess(
        cashierContext,
        "branch_delhi",
        "pos:payments:process",
        rolePermissions
      );

      expect(canRead).toBe(true);
      expect(canPay).toBe(true);
    });

    it("strictly blocks Cashier from organizational settings and manager refunds", () => {
      const canConfigure = evaluateBranchAccess(
        cashierContext,
        "branch_delhi",
        "org:settings:write",
        rolePermissions
      );
      const canApproveRefund = evaluateBranchAccess(
        cashierContext,
        "branch_delhi",
        "finance:refunds:approve",
        rolePermissions
      );

      expect(canConfigure).toBe(false);
      expect(canApproveRefund).toBe(false);

      // Throws RFC 7807 ForbiddenError on guard check
      const cashierPerms = resolveBranchPermissions(
        cashierContext,
        "branch_delhi",
        rolePermissions
      );
      expect(() =>
        requirePermission(cashierPerms, "finance:refunds:approve")
      ).toThrow(ForbiddenError);
    });

    it("grants Branch Manager authority to approve refunds and manage shifts", () => {
      const canApproveRefund = evaluateBranchAccess(
        managerContext,
        "branch_delhi",
        "finance:refunds:approve",
        rolePermissions
      );
      const canCloseShift = evaluateBranchAccess(
        managerContext,
        "branch_delhi",
        "shift:terminal:close",
        rolePermissions
      );

      expect(canApproveRefund).toBe(true);
      expect(canCloseShift).toBe(true);

      const managerPerms = resolveBranchPermissions(
        managerContext,
        "branch_delhi",
        rolePermissions
      );
      expect(() =>
        requirePermission(managerPerms, "finance:refunds:approve")
      ).not.toThrow();
    });

    it("grants Org Admin multi-branch administrative permissions", () => {
      const canConfigOrg = evaluateBranchAccess(
        orgAdminContext,
        "branch_delhi",
        "org:settings:write",
        rolePermissions
      );
      expect(canConfigOrg).toBe(true);
    });

    it("grants System Super Admin universal wildcard access", () => {
      const canAccessAnything = evaluateBranchAccess(
        superAdminContext,
        "branch_anywhere",
        "super:secret:action",
        rolePermissions
      );
      expect(canAccessAnything).toBe(true);
    });
  });

  describe("Aggregate Evaluation Helpers", () => {
    it("hasAllPermissions returns true only when all required permissions are met", () => {
      const supervisorPerms = resolveBranchPermissions(
        supervisorContext,
        "branch_delhi",
        rolePermissions
      );

      expect(
        hasAllPermissions(supervisorPerms, [
          "pos:orders:read",
          "shift:terminal:close",
        ])
      ).toBe(true);

      expect(
        hasAllPermissions(supervisorPerms, [
          "pos:orders:read",
          "finance:audit:approve", // Missing
        ])
      ).toBe(false);
    });

    it("hasAnyPermission returns true if at least one permission matches", () => {
      const cashierPerms = resolveBranchPermissions(
        cashierContext,
        "branch_delhi",
        rolePermissions
      );

      expect(
        hasAnyPermission(cashierPerms, [
          "finance:unauthorized:action",
          "pos:orders:create", // Cashier holds this
        ])
      ).toBe(true);

      expect(
        hasAnyPermission(cashierPerms, [
          "finance:unauthorized:action",
          "system:destroy:everything",
        ])
      ).toBe(false);
    });
  });
});
