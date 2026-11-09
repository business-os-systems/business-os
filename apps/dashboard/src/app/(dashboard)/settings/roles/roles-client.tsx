"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast, Card, cn, ConfigTableRenderer } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { httpClient } from "@/lib/http-client";
import type { RoleDetailDto, PermissionDto } from "@/services/roles.service";
import {
  ROLE_STATUS_FILTERS,
  createRoleTableConfig,
} from "./roles.config";
import { RoleTableToolbar } from "./components/role-table-toolbar";
import { RoleFormModal } from "./components/role-form-modal";
import { RoleDeleteModal } from "./components/role-delete-modal";

export interface RolesClientProps {
  initialRoles: RoleDetailDto[];
  initialPermissions: PermissionDto[];
  userPermissions?: string[];
}

interface ApiProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
}

function extractApiErrorMessage(
  data: unknown,
  fallback = "Operation failed."
): string {
  if (data && typeof data === "object") {
    const p = data as ApiProblemDetails;
    if (typeof p.detail === "string" && p.detail.trim().length > 0) {
      return p.detail;
    }
  }
  return fallback;
}

export function RolesClient({
  initialRoles,
  initialPermissions,
  userPermissions = [],
}: RolesClientProps) {
  const router = useRouter();

  const [roles, setRoles] = useState<RoleDetailDto[]>(initialRoles);
  const [permissions] = useState<PermissionDto[]>(initialPermissions);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roleToView, setRoleToView] = useState<RoleDetailDto | null>(null);
  const [roleToEdit, setRoleToEdit] = useState<RoleDetailDto | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<RoleDetailDto | null>(null);

  const canManageRoles = useMemo(() => {
    return hasPermission(userPermissions, PERMISSIONS.CORE.ROLES_MANAGE);
  }, [userPermissions]);

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      if (statusFilter === "SYSTEM" && !role.isSystem) return false;
      if (statusFilter === "CUSTOM" && role.isSystem) return false;

      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const nameMatch = role.name.toLowerCase().includes(query);
        const slugMatch = role.slug.toLowerCase().includes(query);
        const descMatch = (role.description || "").toLowerCase().includes(query);
        return nameMatch || slugMatch || descMatch;
      }

      return true;
    });
  }, [roles, statusFilter, searchQuery]);

  const handleCreateRole = async (values: {
    name: string;
    slug?: string;
    description?: string;
    permissionActions: string[];
  }): Promise<boolean> => {
    try {
      const res = await httpClient.post<
        { role: RoleDetailDto } | ApiProblemDetails
      >("/api/v1/settings/roles", values);

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to create role."));
        return false;
      }

      const { role } = res.data as { role: RoleDetailDto };
      toast.success(`Role '${role.name}' created successfully!`);
      setRoles((prev) => [role, ...prev]);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create custom role."
      );
      return false;
    }
  };

  const handleUpdateRole = async (values: {
    name: string;
    slug?: string;
    description?: string;
    permissionActions: string[];
  }): Promise<boolean> => {
    if (!roleToEdit) return false;

    try {
      const res = await httpClient.patch<
        { role: RoleDetailDto } | ApiProblemDetails
      >(`/api/v1/settings/roles/${roleToEdit.id}`, {
        name: values.name,
        description: values.description,
        permissionActions: values.permissionActions,
      });

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to update role."));
        return false;
      }

      const { role } = res.data as { role: RoleDetailDto };
      toast.success(`Role '${role.name}' updated successfully!`);
      setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
      router.refresh();
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update custom role."
      );
      return false;
    }
  };

  const handleDeleteRole = async (role: RoleDetailDto): Promise<boolean> => {
    try {
      const res = await httpClient.delete<
        { success: boolean } | ApiProblemDetails
      >(`/api/v1/settings/roles/${role.id}`);

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to delete role."));
        return false;
      }

      toast.success(`Role '${role.name}' deleted successfully.`);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      router.refresh();
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete custom role."
      );
      return false;
    }
  };

  const tableConfig = useMemo(() => {
    return createRoleTableConfig({
      onViewRole: (role) => setRoleToView(role),
      onEditRole: (role) => setRoleToEdit(role),
      onDeleteRole: (role) => setRoleToDelete(role),
    });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Page Header (Sticky) */}
      <div className="shrink-0 bg-background pb-3 border-b border-border sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Roles &amp; Capability Permissions
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage granular access control roles, built-in system safeguards, and capability matrix.
          </p>
        </div>
      </div>

      {/* Toolbar (Sticky) */}
      <div className="shrink-0 bg-background sticky top-[57px] z-20">
        <RoleTableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={ROLE_STATUS_FILTERS}
          onCreateClick={() => setIsCreateOpen(true)}
          canManageRoles={canManageRoles}
        />
      </div>

      {/* Table Data View (Scrollable Rows) */}
      <Card
        className={cn(
          "flex-1 min-h-[300px] overflow-hidden border border-border bg-surface p-0 shadow-2xs flex flex-col"
        )}
      >
        <ConfigTableRenderer
          config={tableConfig}
          rowKey={(row) => row.id}
          data={filteredRoles}
          userPermissions={userPermissions}
          className="border-0 rounded-none shadow-none flex-1 min-h-0 overflow-auto"
        />
      </Card>

      {/* View Role Modal (Read-Only) */}
      <RoleFormModal
        isOpen={Boolean(roleToView)}
        onClose={() => setRoleToView(null)}
        roleToEdit={roleToView}
        mode="view"
        availablePermissions={permissions}
      />

      {/* Create Role Modal */}
      <RoleFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        mode="create"
        availablePermissions={permissions}
        onSubmit={handleCreateRole}
      />

      {/* Edit Role Modal */}
      <RoleFormModal
        isOpen={Boolean(roleToEdit)}
        onClose={() => setRoleToEdit(null)}
        roleToEdit={roleToEdit}
        mode="edit"
        availablePermissions={permissions}
        onSubmit={handleUpdateRole}
      />

      {/* Delete Role Confirmation Modal */}
      <RoleDeleteModal
        isOpen={Boolean(roleToDelete)}
        onClose={() => setRoleToDelete(null)}
        role={roleToDelete}
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}
