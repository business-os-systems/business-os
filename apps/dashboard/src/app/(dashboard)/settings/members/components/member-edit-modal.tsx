"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Input,
  type SelectOption,
} from "@suite/ui";
import type { MemberListItemDto, RoleOptionDto } from "@/services/members.service";

export interface MemberEditModalProps {
  member: MemberListItemDto | null;
  isOpen: boolean;
  onClose: () => void;
  roles: RoleOptionDto[];
  branchOptions: SelectOption[];
  mode?: "edit" | "view";
  onSave?: (
    memberId: string,
    values: {
      name: string;
      mobile?: string | null;
      roleId?: string;
      roleIds: string[];
      branchId?: string | null;
      branchIds: string[];
      managerPin?: string | null;
    }
  ) => Promise<boolean>;
  isSubmitting?: boolean;
}

export function MemberEditModal({
  member,
  isOpen,
  onClose,
  roles,
  branchOptions,
  mode = "edit",
  onSave,
  isSubmitting = false,
}: MemberEditModalProps) {
  const isViewMode = mode === "view";
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isAllBranches, setIsAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setName(member.name || "");
      setMobile(member.mobile || "");
      setManagerPin("");

      const initialRoles =
        member.roleIds && member.roleIds.length > 0
          ? member.roleIds
          : member.roleId
          ? [member.roleId]
          : [];
      setSelectedRoleIds(initialRoles);

      const initialBranches =
        member.branchIds && member.branchIds.length > 0
          ? member.branchIds
          : member.branchId
          ? [member.branchId]
          : [];

      if (initialBranches.length === 0) {
        setIsAllBranches(true);
        setSelectedBranchIds([]);
      } else {
        setIsAllBranches(false);
        setSelectedBranchIds(initialBranches);
      }
      setError(null);
    }
  }, [member]);

  if (!member) return null;

  const toggleRole = (roleId: string) => {
    if (isViewMode) return;
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((id) => id !== roleId);
      }
      return [...prev, roleId];
    });
  };

  const handleToggleAllBranches = () => {
    if (isViewMode) return;
    setIsAllBranches(true);
    setSelectedBranchIds([]);
  };

  const toggleBranch = (branchId: string) => {
    if (isViewMode) return;
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
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewMode || !onSave) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Please enter a valid full name (at least 2 characters).");
      return;
    }

    if (selectedRoleIds.length === 0) {
      setError("Please select at least one assigned role.");
      return;
    }

    const trimmedPin = managerPin.trim();
    if (trimmedPin && !/^\d{4,6}$/.test(trimmedPin)) {
      setError("POS / Terminal PIN must be between 4 and 6 numeric digits.");
      return;
    }

    const success = await onSave(member.id, {
      name: trimmedName,
      mobile: mobile.trim() || null,
      roleId: selectedRoleIds[0],
      roleIds: selectedRoleIds,
      branchId: isAllBranches || selectedBranchIds.length === 0 ? null : selectedBranchIds[0],
      branchIds: isAllBranches ? [] : selectedBranchIds,
      managerPin: trimmedPin || null,
    });

    if (success) {
      handleClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      className="max-w-3xl min-h-[460px] sm:min-h-[500px]"
      title={isViewMode ? `View Member: ${member.name}` : `Edit Member: ${member.name}`}
      description={
        isViewMode
          ? "Inspect member profile details, operational roles, and branch assignments."
          : "Update profile details, organizational access level, and assigned branch execution scope."
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          {isViewMode ? (
            <Button
              type="button"
              onClick={handleClose}
              className="text-xs h-9 font-semibold"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="member-edit-form"
                disabled={isSubmitting}
                className="text-xs h-9 font-semibold"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form id="member-edit-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        {error && (
          <div className="p-2.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        {/* Read-Only Account Info Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2.5 rounded-lg bg-surface-subtle border border-border text-xs">
          <div>
            <span className="text-text-muted block text-[11px]">Member Email:</span>
            <span className="font-semibold text-text font-mono truncate block" title={member.email}>
              {member.email}
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Account Status:</span>
            <span className="font-semibold text-text block">
              {member.status} {member.isPrimaryOwner ? "• Primary Owner" : ""}
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Current Access:</span>
            <span className="font-semibold text-text block truncate">
              {member.roleNames?.length ? member.roleNames.join(", ") : member.roleName}
            </span>
          </div>
        </div>

        {/* Row 1: Profile & Contact Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text block">
              Full Name {!isViewMode && <span className="text-danger">*</span>}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isViewMode}
              required={!isViewMode}
              placeholder="e.g. Hariom Jha"
              className="text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text block">
              Mobile Phone
            </label>
            <Input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={isViewMode}
              placeholder="e.g. +91 98765 43210"
              className="text-xs h-9"
            />
          </div>

          {!isViewMode && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text block">
                POS / Terminal PIN <span className="text-text-muted font-normal">(Optional)</span>
              </label>
              <Input
                type="password"
                maxLength={6}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="Leave blank to keep"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ""))}
                className="text-xs h-9 font-mono"
              />
            </div>
          )}
        </div>

        {/* Row 2: Assigned Roles Multi-Select Chips */}
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <label className="text-xs font-semibold text-text block">
            Assigned Roles {!isViewMode && <span className="text-danger">*</span>}
          </label>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {roles.map((r) => {
              const isSelected = selectedRoleIds.includes(r.id);
              if (isViewMode && !isSelected) return null;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  disabled={isViewMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isViewMode ? "cursor-default" : "cursor-pointer"
                  } ${
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

        {/* Row 3: Operational Branch Scope Multi-Select */}
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <label className="text-xs font-semibold text-text block">
            Operational Branch Scope
          </label>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {(isAllBranches || !isViewMode) && (
              <button
                type="button"
                onClick={handleToggleAllBranches}
                disabled={isViewMode}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isViewMode ? "cursor-default" : "cursor-pointer"
                } ${
                  isAllBranches
                    ? "bg-brand/10 text-brand border-brand/40 ring-1 ring-brand/30 font-semibold"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-subtle hover:text-text"
                }`}
              >
                <span>{isAllBranches ? "✓" : "○"}</span>
                <span>All Branches (Organization-wide)</span>
              </button>
            )}

            {branchOptions.map((b) => {
              const isSelected = !isAllBranches && selectedBranchIds.includes(b.value);
              if (isViewMode && !isSelected) return null;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => toggleBranch(b.value)}
                  disabled={isViewMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isViewMode ? "cursor-default" : "cursor-pointer"
                  } ${
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
      </form>
    </Modal>
  );
}
