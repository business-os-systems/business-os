"use client";

import React, { useState } from "react";
import {
  Modal,
  Button,
  Input,
  Select,
  MailIcon,
  ShareIcon,
  MessageCircleIcon,
  type SelectOption,
} from "@suite/ui";
import { CopyInviteButton } from "@/components/settings/copy-invite-button";
import type { MemberListItemDto, RoleOptionDto } from "@/services/members.service";

export interface MemberInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleOptionDto[];
  branchOptions: SelectOption[];
  existingMembers?: MemberListItemDto[];
  initialInviteUrl?: string | null;
  initialEmail?: string;
  onInvite: (values: {
    email: string;
    roleId?: string;
    roleIds: string[];
    branchId?: string | null;
    branchIds: string[];
    isPreRegistered?: boolean;
  }) => Promise<{ inviteUrl: string } | null>;
  isSubmitting?: boolean;
}

export function MemberInviteModal({
  isOpen,
  onClose,
  roles,
  branchOptions,
  existingMembers = [],
  initialInviteUrl = null,
  initialEmail = "",
  onInvite,
  isSubmitting = false,
}: MemberInviteModalProps) {
  // Mode: "existing" (pick from pre-registered staff) or "email" (direct email)
  const [inviteTargetMode, setInviteTargetMode] = useState<"existing" | "email">("existing");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    roles[0]?.id ? [roles[0].id] : []
  );
  const [isAllBranches, setIsAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(initialInviteUrl);

  React.useEffect(() => {
    if (initialInviteUrl) {
      setCreatedInviteUrl(initialInviteUrl);
    }
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialInviteUrl, initialEmail]);

  // Available pre-registered staff members for invitation (exclude already active members)
  const uninvitedMembers = existingMembers.filter(
    (m) => !m.isInvitation && m.status !== "ACTIVE"
  );

  const memberOptions: SelectOption[] = uninvitedMembers.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.email}) - ${m.roleNames?.length ? m.roleNames.join(", ") : m.roleName}`,
  }));

  const handleMemberSelect = (id: string) => {
    setSelectedMemberId(id);
    const member = uninvitedMembers.find((m) => m.id === id);
    if (member) {
      setEmail(member.email);
      const memberRoles =
        member.roleIds && member.roleIds.length > 0
          ? member.roleIds
          : member.roleId
          ? [member.roleId]
          : [];
      if (memberRoles.length > 0) setSelectedRoleIds(memberRoles);

      const memberBranches =
        member.branchIds && member.branchIds.length > 0
          ? member.branchIds
          : member.branchId
          ? [member.branchId]
          : [];
      if (memberBranches.length === 0) {
        setIsAllBranches(true);
        setSelectedBranchIds([]);
      } else {
        setIsAllBranches(false);
        setSelectedBranchIds(memberBranches);
      }
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== roleId);
      }
      return [...prev, roleId];
    });
  };

  const handleToggleAllBranches = () => {
    setIsAllBranches(true);
    setSelectedBranchIds([]);
  };

  const toggleBranch = (branchId: string) => {
    setIsAllBranches(false);
    setSelectedBranchIds((prev) => {
      const next = prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId];
      if (next.length === 0) {
        setIsAllBranches(true);
      }
      return next;
    });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setInviteTargetMode("existing");
    setSelectedMemberId("");
    setEmail("");
    setSelectedRoleIds(roles[0]?.id ? [roles[0].id] : []);
    setIsAllBranches(true);
    setSelectedBranchIds([]);
    setError(null);
    setCreatedInviteUrl(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(
        inviteTargetMode === "existing"
          ? "Please select a team member from the dropdown."
          : "Please enter an email address."
      );
      return;
    }
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setError("Please select at least one assigned role.");
      return;
    }

    const result = await onInvite({
      email: trimmedEmail,
      roleId: selectedRoleIds[0],
      roleIds: selectedRoleIds,
      branchId: isAllBranches || selectedBranchIds.length === 0 ? null : selectedBranchIds[0],
      branchIds: isAllBranches ? [] : selectedBranchIds,
      isPreRegistered: inviteTargetMode === "existing",
    });

    if (result?.inviteUrl) {
      setCreatedInviteUrl(result.inviteUrl);
    }
  };

  const handleSendEmail = () => {
    if (!createdInviteUrl) return;
    const subject = encodeURIComponent("Invitation to join workspace on Business OS");
    const body = encodeURIComponent(
      `Hello,\n\nYou have been invited to join our workspace on Business OS.\n\nClick the link below to set your password and access your workspace:\n${createdInviteUrl}\n\nThis invitation link will expire in 7 days.\n\nBest regards,\nYour Team`
    );
    const targetEmail = email ? encodeURIComponent(email.trim()) : "";
    window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
  };

  const handleSendWhatsApp = () => {
    if (!createdInviteUrl) return;
    const text = encodeURIComponent(
      `Hello! You have been invited to join our workspace on Business OS. Click here to join: ${createdInviteUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleNativeShare = async () => {
    if (!canNativeShare || !createdInviteUrl) return;
    try {
      await navigator.share({
        title: "Workspace Invitation",
        text: "Join our workspace on Business OS:",
        url: createdInviteUrl,
      });
    } catch {
      // User dismissed share dialog
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      className="max-w-3xl min-h-[460px] sm:min-h-[500px]"
      title={
        createdInviteUrl ? "Invitation Created!" : "Invite Team Member"
      }
      description={
        createdInviteUrl
          ? "Share this invite link directly via email, WhatsApp, or copy to clipboard."
          : "Select a pre-registered team member or enter an email to dispatch an onboarding link."
      }
    >
      {createdInviteUrl ? (
        <div className="space-y-4 pt-2">
          <div className="p-4 rounded-xl bg-surface-subtle border border-border text-center space-y-2">
            <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
              ✓
            </div>
            <h4 className="font-bold text-sm text-text">
              Invitation link is ready
            </h4>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              This single-use invitation link expires in 7 days. Anyone with the link can join your workspace under the assigned role.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text">
              Invitation Link
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdInviteUrl}
                className="text-xs font-mono select-all bg-surface"
              />
              <CopyInviteButton
                inviteUrl={createdInviteUrl}
                label="Copy Link"
                copiedLabel="Copied!"
                className="shrink-0"
              />
            </div>
          </div>

          {/* Quick Dispatch Channels */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-text">
              Share via App
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendEmail}
                className="flex items-center justify-center gap-2 text-xs font-medium h-9"
              >
                <MailIcon size={14} className="shrink-0 text-brand" />
                <span>Send via Email</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendWhatsApp}
                className="flex items-center justify-center gap-2 text-xs font-medium h-9"
              >
                <MessageCircleIcon size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>WhatsApp</span>
              </Button>

              {canNativeShare ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNativeShare}
                  className="flex items-center justify-center gap-2 text-xs font-medium h-9"
                >
                  <ShareIcon size={14} className="shrink-0 text-text-muted" />
                  <span>More Apps...</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const subject = encodeURIComponent("Workspace Invitation Link");
                    const body = encodeURIComponent(createdInviteUrl);
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                  className="flex items-center justify-center gap-2 text-xs font-medium h-9 text-text-muted"
                >
                  <ShareIcon size={14} className="shrink-0" />
                  <span>Forward Link</span>
                </Button>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="button" onClick={handleClose} className="w-full sm:w-auto">
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          {/* Target Mode Segmented Pill */}
          <div className="grid grid-cols-2 p-1 gap-1.5 rounded-xl bg-surface-subtle border border-border">
            <button
              type="button"
              onClick={() => {
                setInviteTargetMode("existing");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs rounded-lg transition-all cursor-pointer ${
                inviteTargetMode === "existing"
                  ? "bg-surface text-text font-bold shadow-xs border border-border ring-1 ring-border/30"
                  : "text-text-muted hover:text-text hover:bg-surface/50 font-medium"
              }`}
            >
              <span>Select Pre-Registered Staff</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                  inviteTargetMode === "existing"
                    ? "bg-brand/10 text-brand border-brand/30"
                    : "bg-surface text-text-muted border-border"
                }`}
              >
                {uninvitedMembers.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteTargetMode("email");
                setError(null);
                setSelectedMemberId("");
              }}
              className={`flex items-center justify-center py-2 px-3 text-xs rounded-lg transition-all cursor-pointer ${
                inviteTargetMode === "email"
                  ? "bg-surface text-text font-bold shadow-xs border border-border ring-1 ring-border/30"
                  : "text-text-muted hover:text-text hover:bg-surface/50 font-medium"
              }`}
            >
              <span>Invite by New Email</span>
            </button>
          </div>

          {/* Member Selection vs Direct Email */}
          {inviteTargetMode === "existing" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">
                Select Team Member <span className="text-danger">*</span>
              </label>
              {memberOptions.length > 0 ? (
                <Select
                  options={memberOptions}
                  value={selectedMemberId}
                  onChange={handleMemberSelect}
                  placeholder="Choose a staff member..."
                />
              ) : (
                <div className="p-3 rounded-lg bg-surface-subtle border border-dashed border-border text-xs text-text-muted">
                  No pre-registered staff found. You can add them first using &ldquo;+ Add Member&rdquo; or invite via direct email.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">
                Recipient Email Address <span className="text-danger">*</span>
              </label>
              <Input
                type="email"
                placeholder="e.g. employee@riverview.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-xs"
                autoFocus
              />
            </div>
          )}

          {/* Assigned Roles Multi-Select Chips */}
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <label className="text-xs font-semibold text-text block">
              Assigned Roles <span className="text-danger">*</span>{" "}
              <span className="text-text-muted font-normal">(Select one or more roles)</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {roles.map((r) => {
                const isSelected = selectedRoleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRole(r.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-brand/10 text-brand border-brand/40 ring-1 ring-brand/30 font-semibold"
                        : "bg-surface text-text-secondary border-border hover:bg-surface-subtle hover:text-text"
                    }`}
                  >
                    <span className="text-xs">{isSelected ? "✓" : "+"}</span>
                    <span>{r.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Operational Branch Scope Multi-Select */}
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <label className="text-xs font-semibold text-text block">
              Operational Branch Scope{" "}
              <span className="text-text-muted font-normal">(Select all branches or specific ones)</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleToggleAllBranches}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  isAllBranches
                    ? "bg-brand/10 text-brand border-brand/40 ring-1 ring-brand/30 font-semibold"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-subtle hover:text-text"
                }`}
              >
                <span>{isAllBranches ? "✓" : "○"}</span>
                <span>All Branches (Organization-wide)</span>
              </button>

              {branchOptions.map((b) => {
                const isSelected = !isAllBranches && selectedBranchIds.includes(b.value);
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => toggleBranch(b.value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-brand/10 text-brand border-brand/40 ring-1 ring-brand/30 font-semibold"
                        : "bg-surface text-text-secondary border-border hover:bg-surface-subtle hover:text-text"
                    }`}
                  >
                    <span className="text-xs">{isSelected ? "✓" : "+"}</span>
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Generating..." : "Generate Invite Link"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
