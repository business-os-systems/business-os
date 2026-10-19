"use client";

import React, { useState } from "react";
import {
  Modal,
  Button,
  Input,
  type SelectOption,
} from "@suite/ui";
import type { RoleOptionDto } from "@/services/members.service";

export interface MemberAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleOptionDto[];
  branchOptions: SelectOption[];
  onAddMember: (values: {
    name: string;
    email: string;
    mobile?: string;
    roleId?: string;
    roleIds: string[];
    branchId?: string;
    branchIds: string[];
    managerPin?: string;
  }) => Promise<boolean>;
  isSubmitting?: boolean;
}

export function MemberAddModal({
  isOpen,
  onClose,
  roles,
  branchOptions,
  onAddMember,
  isSubmitting = false,
}: MemberAddModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    roles[0]?.id ? [roles[0].id] : []
  );
  const [isAllBranches, setIsAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [managerPin, setManagerPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (isSubmitting) return;
    setName("");
    setEmail("");
    setMobile("");
    setSelectedRoleIds(roles[0]?.id ? [roles[0].id] : []);
    setIsAllBranches(true);
    setSelectedBranchIds([]);
    setManagerPin("");
    setError(null);
    onClose();
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) {
        if (prev.length === 1) {
          // Keep at least one role selected
          return prev;
        }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setError("Please enter the team member's full name (at least 2 characters).");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please enter a valid email address.");
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

    const success = await onAddMember({
      name: trimmedName,
      email: trimmedEmail,
      mobile: mobile.trim() || undefined,
      roleId: selectedRoleIds[0],
      roleIds: selectedRoleIds,
      branchId: isAllBranches || selectedBranchIds.length === 0 ? undefined : selectedBranchIds[0],
      branchIds: isAllBranches ? [] : selectedBranchIds,
      managerPin: trimmedPin || undefined,
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
      title="Add Team Member"
      description="Pre-register a new team member with their complete profile and operational role."
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
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
            form="member-add-form"
            disabled={isSubmitting}
            className="text-xs h-9 font-semibold"
          >
            {isSubmitting ? "Adding Member..." : "Add Member"}
          </Button>
        </div>
      }
    >
      <form id="member-add-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        {error && (
          <div className="p-2.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        {/* Row 1: Personal & Contact Information */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text block">
              Full Name <span className="text-danger">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-xs h-9"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text block">
              Email Address <span className="text-danger">*</span>
            </label>
            <Input
              type="email"
              placeholder="e.g. rahul@riverview.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text block">
              Mobile Phone
            </label>
            <Input
              type="tel"
              placeholder="e.g. +91 98765 43210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="text-xs h-9"
            />
          </div>
        </div>

        {/* Row 2: POS / Terminal PIN */}
        <div className="max-w-xs space-y-1">
          <label className="text-xs font-semibold text-text block">
            POS / Terminal PIN <span className="text-text-muted font-normal">(Optional)</span>
          </label>
          <Input
            type="password"
            maxLength={6}
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="4-6 numeric digits"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ""))}
            className="text-xs h-9 font-mono"
          />
        </div>

        {/* Row 3: Assigned Roles Multi-Select Chips */}
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

        {/* Row 4: Operational Branch Scope Multi-Select */}
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

        <p className="text-[11px] text-text-muted pt-1">
          Pre-registering saves this member to your staff directory. You can generate an invitation link whenever you are ready.
        </p>
      </form>
    </Modal>
  );
}
