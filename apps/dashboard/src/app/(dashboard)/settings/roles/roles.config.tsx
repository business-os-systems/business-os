import React from "react";
import { Badge, EyeIcon, PencilIcon, TrashIcon } from "@suite/ui";
import type { TableConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import type { RoleDetailDto } from "@/services/roles.service";

export interface RoleStatusFilterOption {
  id: string;
  label: string;
}

export const ROLE_STATUS_FILTERS: readonly RoleStatusFilterOption[] = [
  { id: "ALL", label: "All Roles" },
  { id: "SYSTEM", label: "System Default" },
  { id: "CUSTOM", label: "Custom" },
] as const;

export interface RoleTableHandlers {
  onViewRole: (role: RoleDetailDto) => void;
  onEditRole: (role: RoleDetailDto) => void;
  onDeleteRole: (role: RoleDetailDto) => void;
}

export function createRoleTableConfig(
  handlers: RoleTableHandlers
): TableConfig<RoleDetailDto> {
  return {
    id: "roles-directory-table",
    columns: [
      {
        key: "name",
        header: "Role Name",
        sortable: true,
        render: (_val, row) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-text">{row.name}</span>
              {row.isSystem && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-brand-tint text-brand border border-brand/20">
                  System
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted font-mono">{row.slug}</div>
          </div>
        ),
      },
      {
        key: "description",
        header: "Description",
        sortable: true,
        render: (value) => {
          const text = String(value || "Standard organizational operational role.");
          return (
            <div className="group relative inline-block max-w-[280px]">
              <span className="text-xs text-text-secondary truncate block cursor-help">
                {text}
              </span>
              <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover:flex w-max max-w-xs flex-col rounded-lg bg-surface border border-border p-2.5 text-xs text-text shadow-xl">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                  Role Description
                </span>
                <span className="leading-relaxed">{text}</span>
              </div>
            </div>
          );
        },
      },
      {
        key: "permissions",
        header: "Capabilities",
        sortable: false,
        render: (_val, row) => {
          if (row.isSystem) {
            return (
              <div className="group relative inline-block cursor-help">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-tint text-brand border border-brand/20">
                  Owner
                </span>
                <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover:flex w-max max-w-xs flex-col rounded-lg bg-surface border border-border p-2.5 text-xs text-text shadow-xl">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                    Administrative Scope
                  </span>
                  <span className="leading-relaxed">
                    Full system wildcard authority across all platform modules and applications.
                  </span>
                </div>
              </div>
            );
          }
          const count = row.permissions.length;
          return (
            <div className="group relative inline-block cursor-help">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-subtle text-text border border-border hover:bg-surface">
                {count} {count === 1 ? "action" : "actions"}
              </span>
              {count > 0 && (
                <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover:flex w-max max-w-sm flex-col gap-1.5 rounded-lg bg-surface border border-border p-2.5 text-xs text-text shadow-xl">
                  <div className="flex items-center justify-between border-b border-border/60 pb-1">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                      Assigned Capabilities ({count})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                    {row.permissions.slice(0, 10).map((action) => (
                      <span
                        key={action}
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-subtle border border-border/70 text-text"
                      >
                        {action}
                      </span>
                    ))}
                    {count > 10 && (
                      <span className="text-[10px] text-text-muted self-center px-1">
                        +{count - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "memberCount",
        header: "Assigned Staff",
        sortable: true,
        render: (value) => (
          <span className="text-xs text-text-secondary">
            {Number(value || 0)} member(s)
          </span>
        ),
      },
      {
        key: "isSystem",
        header: "Type",
        sortable: true,
        render: (value) => {
          if (value) {
            return <Badge variant="outline">System</Badge>;
          }
          return <Badge variant="success">Custom</Badge>;
        },
      },
    ],
    actions: [
      {
        id: "view-role",
        label: "View Role",
        tooltip: "Inspect role attributes and capability permissions",
        variant: "outline",
        permission: PERMISSIONS.CORE.ROLES_READ,
        renderIcon: () => <EyeIcon className="h-3.5 w-3.5 text-text" />,
        isVisible: () => true,
        onClick: (role) => handlers.onViewRole(role),
      },
      {
        id: "edit-role",
        label: "Edit Role",
        tooltip: "Edit role attributes and capability permissions",
        variant: "outline",
        permission: PERMISSIONS.CORE.ROLES_MANAGE,
        renderIcon: () => <PencilIcon className="h-3.5 w-3.5 text-text" />,
        isVisible: (role) => !role.isSystem,
        onClick: (role) => handlers.onEditRole(role),
      },
      {
        id: "delete-role",
        label: "Delete Role",
        tooltip: "Permanently delete custom role",
        variant: "outline",
        permission: PERMISSIONS.CORE.ROLES_MANAGE,
        renderIcon: () => <TrashIcon className="h-3.5 w-3.5 text-danger" />,
        isVisible: (role) => !role.isSystem,
        verification: {
          kind: "typed",
          title: "Delete role",
          message: "This permanently deletes the custom role.",
          expectedPhrase: (role: RoleDetailDto) => role.name,
        },
        onClick: (role) => handlers.onDeleteRole(role),
      },
    ],
    emptyState: {
      title: "No Roles Configured",
      description: "Organization access roles will appear here.",
    },
  };
}
