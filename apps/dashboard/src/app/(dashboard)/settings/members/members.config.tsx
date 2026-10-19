import React from "react";
import { z } from "zod";
import {
  Badge,
  EyeIcon,
  PencilIcon,
  PowerIcon,
  TrashIcon,
  CopyIcon,
  XIcon,
} from "@suite/ui";
import type { TableConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import type { MemberListItemDto } from "@/services/members.service";

export interface MemberStatusFilterOption {
  id: string;
  label: string;
}

export const MEMBER_STATUS_FILTERS: readonly MemberStatusFilterOption[] = [
  { id: "ALL", label: "All Members" },
  { id: "ACTIVE", label: "Active" },
  { id: "INVITED", label: "Invited" },
  { id: "SUSPENDED", label: "Suspended" },
] as const;

export interface InviteFormValues {
  email: string;
  roleId: string;
  branchId?: string;
}

export const inviteValidationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
  roleId: z.string().trim().min(1, "Please select an assigned role"),
  branchId: z.string().trim().optional(),
});

export interface CreateMemberTableConfigOptions {
  onViewMember: (member: MemberListItemDto) => void;
  onEditMember: (member: MemberListItemDto) => void;
  onToggleStatus: (member: MemberListItemDto) => void;
  onRemoveMember: (member: MemberListItemDto) => void;
  onCopyInvite: (member: MemberListItemDto) => void;
  onCancelInvite: (member: MemberListItemDto) => void;
  onAddMember: () => void;
}

export function createMemberTableConfig({
  onViewMember,
  onEditMember,
  onToggleStatus,
  onRemoveMember,
  onCopyInvite,
  onCancelInvite,
  onAddMember,
}: CreateMemberTableConfigOptions): TableConfig<MemberListItemDto> {
  return {
    id: "members-directory-table",
    columns: [
      {
        key: "name",
        header: "Member",
        sortable: true,
        render: (_val, row) => {
          const initial = (row.name || row.email || "U").charAt(0).toUpperCase();

          return (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-xs text-brand border border-brand/20">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-text truncate max-w-[180px]">
                    {row.name}
                  </span>
                  {row.isPrimaryOwner && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-tint text-brand">
                      Owner
                    </span>
                  )}
                  {row.isInvitation && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Pending
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted truncate max-w-[200px]">
                  {row.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        key: "roleName",
        header: "Assigned Role",
        sortable: true,
        render: (_val, row) => {
          const roles =
            row.roleNames && row.roleNames.length > 0
              ? row.roleNames
              : [row.roleName];

          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {roles.map((rName, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-subtle text-text whitespace-nowrap"
                >
                  {rName}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        key: "branchName",
        header: "Branch Scope",
        sortable: true,
        render: (_val, row) => {
          const branches =
            row.branchNames && row.branchNames.length > 0
              ? row.branchNames
              : row.branchName
              ? [row.branchName]
              : ["All Branches"];

          return (
            <div className="flex flex-wrap items-center gap-1">
              {branches.map((bName, idx) => (
                <span
                  key={idx}
                  className="text-xs text-text-secondary bg-surface-subtle px-2 py-0.5 rounded-md"
                >
                  {bName}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (value) => {
          if (value === "ACTIVE") {
            return <Badge variant="success">Active</Badge>;
          }
          if (value === "INVITED") {
            return <Badge variant="outline">Invited</Badge>;
          }
          if (value === "SUSPENDED") {
            return <Badge variant="destructive">Suspended</Badge>;
          }
          if (value === "REVOKED") {
            return <Badge variant="destructive">Revoked</Badge>;
          }
          return <Badge variant="outline">{String(value)}</Badge>;
        },
      },
      {
        key: "createdAt",
        header: "Joined / Invited",
        sortable: true,
        render: (value) => {
          if (!value) return <span className="text-text-muted text-xs">—</span>;
          const date = new Date(value as string | Date);
          return (
            <span className="text-xs text-text-muted">
              {date.toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          );
        },
      },
    ],
    actions: [
      {
        id: "view-member",
        label: "View Member",
        tooltip: "Inspect member profile, roles, and branch scope",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_READ,
        renderIcon: () => <EyeIcon className="h-3.5 w-3.5 text-text" />,
        isVisible: (member) => !member.isInvitation,
        onClick: (member) => onViewMember(member),
      },
      {
        id: "copy-invite",
        label: "Copy Invite Link",
        tooltip: "Copy Invite Link for WhatsApp / SMS",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_MANAGE,
        renderIcon: () => <CopyIcon className="h-3.5 w-3.5 text-brand" />,
        isVisible: (member) => Boolean(member.invitationToken),
        onClick: (member) => onCopyInvite(member),
      },
      {
        id: "cancel-invite",
        label: "Cancel Invite",
        tooltip: "Cancel this pending invitation",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_MANAGE,
        renderIcon: () => <XIcon className="h-3.5 w-3.5 text-danger" />,
        isVisible: (member) => member.isInvitation,
        onClick: (member) => onCancelInvite(member),
      },
      {
        id: "edit-member",
        label: "Edit Member",
        tooltip: "Edit member details, role, and branch assignment",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_MANAGE,
        renderIcon: () => <PencilIcon className="h-3.5 w-3.5 text-text" />,
        isVisible: (member) => !member.isInvitation,
        onClick: (member) => onEditMember(member),
      },
      {
        id: "toggle-status",
        label: (member) =>
          member.status === "ACTIVE" ? "Suspend Access" : "Activate Access",
        tooltip: (member) =>
          member.status === "ACTIVE"
            ? "Suspend team member's access"
            : "Activate suspended team member",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_MANAGE,
        renderIcon: (member) => (
          <PowerIcon
            className={`h-3.5 w-3.5 ${
              member.status === "ACTIVE" ? "text-text-muted" : "text-action"
            }`}
          />
        ),
        isVisible: (member) => !member.isInvitation && !member.isPrimaryOwner,
        onClick: (member) => onToggleStatus(member),
      },
      {
        id: "delete-member",
        label: "Remove Member",
        tooltip: "Permanently remove member from workspace",
        variant: "outline",
        permission: PERMISSIONS.CORE.USERS_MANAGE,
        renderIcon: () => <TrashIcon className="h-3.5 w-3.5 text-danger" />,
        isVisible: (member) => !member.isInvitation && !member.isPrimaryOwner,
        onClick: (member) => onRemoveMember(member),
      },
    ],
    emptyState: {
      title: "No Team Members Found",
      description: "Start building your organization by inviting your first team member.",
      actionLabel: "+ Invite Member",
      onAction: onAddMember,
    },
  };
}
