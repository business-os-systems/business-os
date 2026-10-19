"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast, Card, cn } from "@suite/ui";
import type { SelectOption } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { ConfigTableRenderer } from "@/components/config-renderers/config-table-renderer";
import { httpClient } from "@/lib/http-client";
import type {
  MemberListItemDto,
  RoleOptionDto,
} from "@/services/members.service";
import { createMemberTableConfig } from "./members.config";
import { MemberTableToolbar } from "./components/member-table-toolbar";
import { MemberAddModal } from "./components/member-add-modal";
import { MemberInviteModal } from "./components/member-invite-modal";
import { MemberEditModal } from "./components/member-edit-modal";
import { MemberDangerModal } from "./components/member-danger-modal";

export interface MembersClientProps {
  initialMembers: MemberListItemDto[];
  roles: RoleOptionDto[];
  branches: Array<{ id: string; name: string }>;
  organizationId: string;
  userPermissions?: string[];
}

interface ApiProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Array<{ message?: string } | string>;
}

function extractApiErrorMessage(errData: unknown, fallback: string): string {
  if (!errData) return fallback;
  if (typeof errData === "string") return errData;
  if (typeof errData === "object" && errData !== null) {
    const problem = errData as ApiProblemDetails;
    if (
      typeof problem.detail === "string" &&
      problem.detail.trim().length > 0
    ) {
      return problem.detail;
    }
    if (typeof problem.title === "string" && problem.title.trim().length > 0) {
      return problem.title;
    }
    if (Array.isArray(problem.errors) && problem.errors.length > 0) {
      const first = problem.errors[0];
      if (typeof first === "string") return first;
      if (typeof first?.message === "string") return first.message;
    }
  }
  return fallback;
}

export function MembersClient({
  initialMembers,
  roles,
  branches,
  organizationId: _organizationId,
  userPermissions = [],
}: MembersClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberListItemDto[]>(initialMembers);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals visibility state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteModalData, setInviteModalData] = useState<{
    url: string | null;
    email: string;
  }>({ url: null, email: "" });
  const [viewingMember, setViewingMember] = useState<MemberListItemDto | null>(
    null,
  );
  const [editingMember, setEditingMember] = useState<MemberListItemDto | null>(
    null,
  );
  const [memberToRemove, setMemberToRemove] =
    useState<MemberListItemDto | null>(null);

  const canManage = hasPermission(
    userPermissions,
    PERMISSIONS.CORE.USERS_MANAGE,
  );

  const branchOptions: SelectOption[] = useMemo(
    () => branches.map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  // Filter members by status and search query
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      // 1. Status Filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "ACTIVE" && member.status !== "ACTIVE")
          return false;
        if (statusFilter === "INVITED" && member.status !== "INVITED")
          return false;
        if (statusFilter === "SUSPENDED" && member.status !== "SUSPENDED")
          return false;
      }

      // 2. Search Query (name, email, role, branch)
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const nameMatch = member.name.toLowerCase().includes(query);
        const emailMatch = member.email.toLowerCase().includes(query);
        const roleMatch = member.roleName.toLowerCase().includes(query);
        const branchMatch = member.branchName.toLowerCase().includes(query);
        return nameMatch || emailMatch || roleMatch || branchMatch;
      }

      return true;
    });
  }, [members, statusFilter, searchQuery]);

  // Handle Direct Member Addition
  const handleAddMember = async (values: {
    name: string;
    email: string;
    mobile?: string;
    roleId?: string;
    roleIds: string[];
    branchId?: string;
    branchIds: string[];
    managerPin?: string;
  }): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const res = await httpClient.post<
        { member: MemberListItemDto; inviteUrl?: string } | ApiProblemDetails
      >("/api/v1/settings/members", { action: "add", ...values });

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to add team member."),
        );
        return false;
      }

      const { member: newMember, inviteUrl } = res.data as {
        member: MemberListItemDto;
        inviteUrl?: string;
      };
      toast.success(`Team member ${newMember.name} added successfully!`);
      setMembers((prev) => {
        const filtered = prev.filter(
          (m) =>
            m.email.toLowerCase() !== newMember.email.toLowerCase() &&
            m.id !== newMember.id
        );
        return [newMember, ...filtered];
      });
      setIsAddOpen(false);
      if (inviteUrl) {
        setInviteModalData({ url: inviteUrl, email: newMember.email });
        setIsInviteOpen(true);
      }
      router.refresh();
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while adding team member.";
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Member Invitation
  const handleInvite = async (values: {
    email: string;
    roleId?: string;
    roleIds: string[];
    branchId?: string | null;
    branchIds: string[];
    isPreRegistered?: boolean;
  }): Promise<{ inviteUrl: string } | null> => {
    setIsSubmitting(true);
    try {
      const res = await httpClient.post<
        | {
            invitation: MemberListItemDto;
            inviteUrl: string;
          }
        | ApiProblemDetails
      >("/api/v1/settings/members", { action: "invite", ...values });

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to create invitation."),
        );
        return null;
      }

      const { invitation, inviteUrl } = res.data as {
        invitation: MemberListItemDto;
        inviteUrl: string;
      };

      toast.success(`Invitation created for ${invitation.email}!`);
      // Update member in list if already exists, otherwise prepend
      setMembers((prev) => {
        const exists = prev.some(
          (m) => m.email.toLowerCase() === invitation.email.toLowerCase(),
        );
        if (exists) {
          return prev.map((m) =>
            m.email.toLowerCase() === invitation.email.toLowerCase()
              ? {
                  ...m,
                  invitationToken: invitation.invitationToken,
                  expiresAt: invitation.expiresAt,
                }
              : m,
          );
        }
        return [invitation, ...prev];
      });
      router.refresh();
      return { inviteUrl };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while creating invitation.";
      toast.error(msg);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Member Details Update (Profile, Role, Branch, POS PIN)
  const handleEditMember = async (
    memberId: string,
    values: {
      name: string;
      mobile?: string | null;
      roleId?: string;
      roleIds: string[];
      branchId?: string | null;
      branchIds: string[];
      managerPin?: string | null;
    },
  ): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const res = await httpClient.patch<
        { member: MemberListItemDto } | ApiProblemDetails
      >(`/api/v1/settings/members/${memberId}`, values);

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to update member details."),
        );
        return false;
      }

      const { member: updated } = res.data as { member: MemberListItemDto };
      toast.success(`Member details updated for ${updated.name}.`);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
      router.refresh();
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while updating member.";
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Toggle (Suspend / Reactivate)
  const handleToggleStatus = async (member: MemberListItemDto) => {
    const nextStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setIsSubmitting(true);
    try {
      const res = await httpClient.patch<
        { member: MemberListItemDto } | ApiProblemDetails
      >(`/api/v1/settings/members/${member.id}/status`, { status: nextStatus });

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to update member status."),
        );
        return;
      }

      const { member: updated } = res.data as { member: MemberListItemDto };
      toast.success(
        nextStatus === "ACTIVE"
          ? `${member.name} has been reactivated.`
          : `${member.name}'s access has been suspended.`,
      );
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while updating status.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Permanent Member Removal from Workspace
  const handleRemoveMemberConfirm = async () => {
    if (!memberToRemove) return;

    setIsSubmitting(true);
    try {
      const res = await httpClient.delete<
        { success: boolean; message: string } | ApiProblemDetails
      >(`/api/v1/settings/members/${memberToRemove.id}`);

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to remove member from workspace."),
        );
        return;
      }

      toast.success(`${memberToRemove.name} has been removed from the workspace.`);
      setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id));
      setMemberToRemove(null);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while removing member.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel Invitation
  const handleCancelInvite = async (member: MemberListItemDto) => {
    setIsSubmitting(true);
    try {
      const res = await httpClient.delete<unknown | ApiProblemDetails>(
        `/api/v1/settings/members/invitations/${member.id}`,
      );

      if (!res.ok) {
        toast.error(
          extractApiErrorMessage(res.data, "Failed to cancel invitation."),
        );
        return;
      }

      toast.success(`Invitation for ${member.email} canceled.`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error while canceling invitation.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Copy Invite Link
  const handleCopyInvite = (member: MemberListItemDto) => {
    if (!member.invitationToken) return;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${baseUrl}/invite/${member.invitationToken}`;

    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(inviteUrl);
      toast.success("Invitation link copied to clipboard!");
    }
  };

  const tableConfig = useMemo(
    () =>
      createMemberTableConfig({
        onViewMember: (m) => setViewingMember(m),
        onEditMember: (m) => setEditingMember(m),
        onToggleStatus: (m) => void handleToggleStatus(m),
        onRemoveMember: (m) => setMemberToRemove(m),
        onCopyInvite: (m) => handleCopyInvite(m),
        onCancelInvite: (m) => void handleCancelInvite(m),
        onAddMember: () => setIsAddOpen(true),
      }),
    [],
  );

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Page Header (Sticky) */}
      <div className="shrink-0 bg-background pb-3 border-b border-border sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Team Members &amp; Invites
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage member and their invites.
          </p>
        </div>
      </div>

      {/* Decomposed Search & Filter Toolbar with Dual Action Buttons (Sticky) */}
      <div className="shrink-0 bg-background sticky top-[57px] z-20">
        <MemberTableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          canManage={canManage}
          onAddMember={() => setIsAddOpen(true)}
          onInviteMember={() => setIsInviteOpen(true)}
        />
      </div>

      {/* Table Data View (Scrollable Rows) */}
      <Card
        className={cn(
          "flex-1 min-h-[300px] overflow-hidden border border-border bg-surface p-0 shadow-2xs flex flex-col",
        )}
      >
        <ConfigTableRenderer
          config={tableConfig}
          data={filteredMembers}
          userPermissions={userPermissions}
          className="border-0 rounded-none shadow-none flex-1 min-h-0 overflow-auto"
        />
      </Card>

      {/* Decomposed Add Member Modal (Pre-registration) */}
      <MemberAddModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        roles={roles}
        branchOptions={branchOptions}
        onAddMember={handleAddMember}
        isSubmitting={isSubmitting}
      />

      {/* Decomposed Invite Member Modal (Multi-channel Link Dispatch) */}
      <MemberInviteModal
        isOpen={isInviteOpen}
        onClose={() => {
          setIsInviteOpen(false);
          setInviteModalData({ url: null, email: "" });
        }}
        roles={roles}
        branchOptions={branchOptions}
        existingMembers={members}
        initialInviteUrl={inviteModalData.url}
        initialEmail={inviteModalData.email}
        onInvite={handleInvite}
        isSubmitting={isSubmitting}
      />

      {/* Decomposed View Member Modal */}
      <MemberEditModal
        isOpen={Boolean(viewingMember)}
        onClose={() => setViewingMember(null)}
        member={viewingMember}
        roles={roles}
        branchOptions={branchOptions}
        mode="view"
      />

      {/* Decomposed Edit Member Modal */}
      <MemberEditModal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        member={editingMember}
        roles={roles}
        branchOptions={branchOptions}
        mode="edit"
        onSave={handleEditMember}
        isSubmitting={isSubmitting}
      />

      {/* Decomposed Protective Danger Modal */}
      <MemberDangerModal
        member={memberToRemove}
        isOpen={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemoveMemberConfirm}
        isProcessing={isSubmitting}
      />
    </div>
  );
}
