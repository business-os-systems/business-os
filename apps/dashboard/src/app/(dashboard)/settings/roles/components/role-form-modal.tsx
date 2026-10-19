"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  Input,
  Textarea,
  Checkbox,
  Badge,
  ChevronDownIcon,
} from "@suite/ui";
import type { RoleDetailDto, PermissionDto } from "@/services/roles.service";

export type RoleFormModalMode = "create" | "edit" | "view";

export interface RoleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  roleToEdit?: RoleDetailDto | null;
  mode?: RoleFormModalMode;
  availablePermissions: PermissionDto[];
  onSubmit?: (values: {
    name: string;
    slug?: string;
    description?: string;
    permissionActions: string[];
  }) => Promise<boolean>;
}

const MODULE_TITLES: Record<string, string> = {
  core: "Platform Core & Security",
  cms: "Website & Content Builder",
  website_builder: "Website & Content Builder",
};

export function formatModuleTitle(appId: string): string {
  return MODULE_TITLES[appId] || appId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RoleFormModal({
  isOpen,
  onClose,
  roleToEdit,
  mode,
  availablePermissions,
  onSubmit,
}: RoleFormModalProps) {
  const effectiveMode: RoleFormModalMode =
    mode ?? (roleToEdit ? "edit" : "create");
  const isViewMode = effectiveMode === "view";
  const isEditMode = effectiveMode === "edit";

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group permissions dynamically by appId
  const groupedPermissions = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of availablePermissions) {
      const group = map.get(p.appId) || [];
      group.push(p);
      map.set(p.appId, group);
    }
    return map;
  }, [availablePermissions]);

  useEffect(() => {
    if (roleToEdit) {
      setName(roleToEdit.name);
      setSlug(roleToEdit.slug);
      setDescription(roleToEdit.description || "");
      setSelectedPermissions(new Set(roleToEdit.permissions));
    } else {
      setName("");
      setSlug("");
      setDescription("");
      setSelectedPermissions(new Set());
    }
    // Initially collapse all app permission sections per spec
    setExpandedGroups(new Set());
    setError(null);
  }, [roleToEdit, isOpen]);

  const toggleGroupExpand = (appId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  // Auto-generate lowercase kebab slug when name changes in create mode
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!isEditMode && !isViewMode) {
      setSlug(
        newName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      );
    }
  };

  const togglePermission = (action: string) => {
    if (isViewMode) return;
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
      }
      return next;
    });
  };

  const toggleGroup = (appId: string) => {
    if (isViewMode) return;
    const perms = groupedPermissions.get(appId) || [];
    const allSelected = perms.every((p) => selectedPermissions.has(p.action));

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (allSelected) {
          next.delete(p.action);
        } else {
          next.add(p.action);
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewMode) {
      onClose();
      return;
    }

    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Role name must be at least 2 characters long.");
      return;
    }
    if (trimmedName.length > 50) {
      setError("Role name cannot exceed 50 characters.");
      return;
    }

    if (!onSubmit) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await onSubmit({
        name: trimmedName,
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        permissionActions: Array.from(selectedPermissions),
      });

      if (success) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = isViewMode
    ? `View Role: ${roleToEdit?.name || name}`
    : isEditMode
    ? `Edit Role: ${roleToEdit?.name || name}`
    : "Create Custom Role";

  const modalDescription = isViewMode
    ? "Inspect role attributes, identifier slug, and assigned capability permissions."
    : isEditMode
    ? "Update role attributes and assign capability permissions for this organizational role."
    : "Define a new access control role with granular capability permissions.";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      className="max-w-4xl"
      contentClassName="py-2.5 flex-1 text-sm leading-normal"
      title={modalTitle}
      description={modalDescription}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          {isViewMode ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="role-form-modal"
                variant="primary"
                disabled={isSubmitting}
                className="w-full sm:w-auto font-semibold"
              >
                {isSubmitting
                  ? "Saving Role..."
                  : isEditMode
                  ? "Update Role"
                  : "Create Role"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form
        id="role-form-modal"
        onSubmit={handleSubmit}
        className="px-1 py-1 space-y-4"
      >
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        {/* Two-Pane Responsive Split Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* LEFT PANE: Role Attributes Form (5 cols on md+) */}
          <div className="md:col-span-5 space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text flex items-center justify-between">
                <span>
                  Role Name {!isViewMode && <span className="text-danger">*</span>}
                </span>
                <span className="text-[10px] text-text-muted font-normal">
                  2–50 chars
                </span>
              </label>
              <Input
                required={!isViewMode}
                maxLength={50}
                placeholder="e.g. Website Designer"
                value={name}
                onChange={handleNameChange}
                disabled={isViewMode || isSubmitting}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text flex items-center justify-between">
                <span>Identifier Slug</span>
                <span className="text-[10px] text-text-muted font-normal">
                  auto-derived
                </span>
              </label>
              <Input
                disabled
                placeholder="website-designer"
                value={slug}
                className="text-xs font-mono bg-surface-subtle cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text flex items-center justify-between">
                <span>Description</span>
                <span className="text-[10px] text-text-muted font-normal">
                  {description.length}/200
                </span>
              </label>
              <Textarea
                rows={3}
                maxLength={200}
                placeholder="Describe operational capabilities and responsibilities..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isViewMode || isSubmitting}
                className="text-xs resize-none"
              />
            </div>

            {roleToEdit?.isSystem && (
              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                Built-in system roles are protected by platform safeguards and cannot be modified.
              </div>
            )}
          </div>

          {/* RIGHT PANE: App-Categorized Capabilities Matrix (7 cols on md+) */}
          <div className="md:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-border">
              <label className="text-xs font-bold text-text uppercase tracking-wider">
                Capability Permissions ({selectedPermissions.size})
              </label>
              <span className="text-[11px] text-text-muted">
                {isViewMode ? "Assigned platform actions" : "Select allowed actions"}
              </span>
            </div>

            {/* Scrollable list inside right pane to prevent viewport blowout */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {Array.from(groupedPermissions.entries()).map(([appId, perms]) => {
                const selectedCount = perms.filter((p) =>
                  selectedPermissions.has(p.action)
                ).length;
                const allSelected = selectedCount === perms.length;
                const isExpanded = expandedGroups.has(appId);

                return (
                  <div
                    key={appId}
                    className="rounded-xl border border-border bg-surface-subtle/30 overflow-hidden transition-all"
                  >
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-subtle/50 select-none transition-colors"
                      onClick={() => toggleGroupExpand(appId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleGroupExpand(appId);
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDownIcon
                          className={`h-4 w-4 text-text-muted transition-transform duration-200 ${
                            isExpanded ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                        <span className="font-semibold text-xs text-text">
                          {formatModuleTitle(appId)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1.5"
                        >
                          {selectedCount}/{perms.length}
                        </Badge>
                      </div>

                      {!isViewMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(appId);
                          }}
                          className="text-[11px] font-medium text-action hover:underline cursor-pointer"
                        >
                          {allSelected ? "Deselect All" : "Select All"}
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="space-y-1.5 p-3 pt-1 border-t border-border/40">
                        {perms.map((perm) => {
                          const isChecked = selectedPermissions.has(perm.action);
                          return (
                            <div
                              key={perm.action}
                              onClick={() =>
                                !isViewMode && togglePermission(perm.action)
                              }
                              className={`p-2 rounded-lg border transition-colors flex items-start gap-2.5 ${
                                !isViewMode ? "cursor-pointer" : "cursor-default"
                              } ${
                                isChecked
                                  ? "bg-surface border-brand/40 ring-1 ring-brand/20 shadow-2xs"
                                  : "bg-surface/50 border-border/70 hover:bg-surface hover:border-border"
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onChange={() =>
                                  !isViewMode && togglePermission(perm.action)
                                }
                                disabled={isViewMode}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 space-y-0.5">
                                <div className="font-mono text-[11px] font-semibold text-text truncate">
                                  {perm.action}
                                </div>
                                <div className="text-[11px] text-text-secondary leading-tight">
                                  {perm.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
