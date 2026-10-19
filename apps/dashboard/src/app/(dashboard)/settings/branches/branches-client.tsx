"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast, Card, cn } from "@suite/ui";
import type { FormFieldOption } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { ConfigTableRenderer } from "@/components/config-renderers/config-table-renderer";
import { httpClient } from "@/lib/http-client";
import type { BranchListItemDto } from "@/services/branches.service";
import {
  DEFAULT_BRANCH_CONFIG,
  NO_PARENT_BRANCH_OPTION,
  createBranchTableConfig,
  type BranchFormValues,
} from "./branches.config";
import { BranchTableToolbar } from "./components/branch-table-toolbar";
import { BranchFormModal } from "./components/branch-form-modal";
import { BranchDangerModal } from "./components/branch-danger-modal";

export interface OrganizationDefaults {
  currency: string;
  locale: string;
  timezone?: string;
}

export interface BranchesClientProps {
  initialBranches: BranchListItemDto[];
  organizationId: string;
  activeBranchId?: string | null;
  userPermissions?: string[];
  organizationDefaults?: OrganizationDefaults;
  addressOptions?: FormFieldOption[];
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
    if (typeof problem.detail === "string" && problem.detail.trim().length > 0) {
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

export function BranchesClient({
  initialBranches,
  organizationId: _organizationId,
  activeBranchId,
  userPermissions = [],
  organizationDefaults,
  addressOptions = [],
}: BranchesClientProps) {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchListItemDto[]>(initialBranches);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals visibility state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchListItemDto | null>(null);
  const [archivingBranch, setArchivingBranch] = useState<BranchListItemDto | null>(null);

  const canWrite = hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_WRITE);

  // Dynamic default values resolved from organization context
  const defaultCreateValues: BranchFormValues = useMemo(
    () => ({
      name: "",
      code: "",
      type: DEFAULT_BRANCH_CONFIG.type,
      parentBranchId: "",
      addressId: "",
      timezone: organizationDefaults?.timezone ?? DEFAULT_BRANCH_CONFIG.timezone,
      nightAuditHour: DEFAULT_BRANCH_CONFIG.nightAuditHour,
      currency: organizationDefaults?.currency ?? DEFAULT_BRANCH_CONFIG.currency,
      locale: organizationDefaults?.locale ?? DEFAULT_BRANCH_CONFIG.locale,
      dateFormat: DEFAULT_BRANCH_CONFIG.dateFormat,
      timeFormat: DEFAULT_BRANCH_CONFIG.timeFormat,
      taxIdentifier: "",
      capabilities: [...DEFAULT_BRANCH_CONFIG.capabilities],
    }),
    [organizationDefaults]
  );

  const editInitialValues: BranchFormValues = useMemo(() => {
    if (!editingBranch) return defaultCreateValues;
    return {
      name: editingBranch.name,
      code: editingBranch.code,
      type: editingBranch.type,
      parentBranchId: editingBranch.parentBranchId || "",
      addressId: editingBranch.addressId || "",
      timezone: editingBranch.timezone,
      nightAuditHour: editingBranch.nightAuditHour,
      currency: editingBranch.currency,
      locale: editingBranch.locale,
      dateFormat: editingBranch.dateFormat,
      timeFormat: editingBranch.timeFormat,
      taxIdentifier: editingBranch.taxIdentifier || "",
      capabilities: editingBranch.capabilities || [],
    };
  }, [editingBranch, defaultCreateValues]);

  const parentBranchOptions: FormFieldOption[] = useMemo(() => {
    const options: FormFieldOption[] = [NO_PARENT_BRANCH_OPTION];
    for (const b of branches) {
      if (!editingBranch || b.id !== editingBranch.id) {
        options.push({ label: `${b.name} (${b.code})`, value: b.id });
      }
    }
    return options;
  }, [branches, editingBranch]);

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q) ||
        (b.address?.city && b.address.city.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [branches, statusFilter, searchQuery]);

  const handleCreateSubmit = async (values: BranchFormValues) => {
    if (!values.name || !values.code) {
      toast.error("Branch name and unique code are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        parentBranchId: values.parentBranchId || undefined,
        taxIdentifier: values.taxIdentifier || undefined,
      };

      const res = await httpClient.post<BranchListItemDto | ApiProblemDetails>(
        "/api/v1/settings/branches",
        payload
      );

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to create branch."));
        return;
      }

      const created = res.data as BranchListItemDto;
      toast.success(`Branch ${created.name} (${created.code}) registered successfully.`);
      setBranches((prev) => [...prev, created]);
      setIsCreateOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error while creating branch.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (values: BranchFormValues) => {
    if (!editingBranch) return;

    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        parentBranchId: values.parentBranchId || null,
        taxIdentifier: values.taxIdentifier || null,
      };

      const res = await httpClient.patch<BranchListItemDto | ApiProblemDetails>(
        `/api/v1/settings/branches/${editingBranch.id}`,
        payload
      );

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to update branch."));
        return;
      }

      const updated = res.data as BranchListItemDto;
      toast.success("Branch details updated successfully.");
      setBranches((prev) => prev.map((b) => (b.id === editingBranch.id ? updated : b)));
      setEditingBranch(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error while updating branch.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (branch: BranchListItemDto) => {
    const nextStatus = branch.status === "ACTIVE" ? "TEMPORARILY_CLOSED" : "ACTIVE";
    const actionLabel = nextStatus === "ACTIVE" ? "reopened" : "temporarily closed";

    try {
      const res = await httpClient.patch<BranchListItemDto | ApiProblemDetails>(
        `/api/v1/settings/branches/${branch.id}`,
        { status: nextStatus }
      );

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, `Failed to change status to ${nextStatus}.`));
        return;
      }

      const updated = res.data as BranchListItemDto;
      toast.success(`Branch ${branch.code} is now ${actionLabel}.`);
      setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error while updating status.";
      toast.error(msg);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archivingBranch) return;

    setIsSubmitting(true);
    try {
      const res = await httpClient.patch<BranchListItemDto | ApiProblemDetails>(
        `/api/v1/settings/branches/${archivingBranch.id}`,
        { status: "ARCHIVED" },
      );

      if (!res.ok) {
        toast.error(extractApiErrorMessage(res.data, "Failed to archive branch."));
        return;
      }

      const updated = res.data as BranchListItemDto;
      toast.success(`Branch ${archivingBranch.code} has been archived.`);
      setBranches((prev) => prev.map((b) => (b.id === archivingBranch.id ? updated : b)));
      setArchivingBranch(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error while archiving branch.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tableConfig = useMemo(
    () =>
      createBranchTableConfig({
        activeBranchId: activeBranchId ?? undefined,
        onEdit: (b) => setEditingBranch(b),
        onToggleStatus: (b) => void handleToggleStatus(b),
        onArchive: (b) => setArchivingBranch(b),
        onAddBranch: () => setIsCreateOpen(true),
      }),
    [activeBranchId]
  );

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Page Header (Sticky) */}
      <div className="shrink-0 bg-background pb-3 border-b border-border sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Operational Branches &amp; Sites
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage physical execution units, operational turnover clocks, and venue capabilities.
          </p>
        </div>
      </div>

      {/* Decomposed Search & Filter Toolbar (Sticky) */}
      <div className="shrink-0 bg-background sticky top-[57px] z-20">
        <BranchTableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          canWrite={canWrite}
          onAddBranch={() => setIsCreateOpen(true)}
        />
      </div>

      {/* Table Data View (Scrollable Rows) */}
      <Card className={cn("flex-1 min-h-[300px] overflow-hidden border border-border bg-surface p-0 shadow-2xs flex flex-col")}>
        <ConfigTableRenderer
          config={tableConfig}
          data={filteredBranches}
          userPermissions={userPermissions}
          className="border-0 rounded-none shadow-none flex-1 min-h-0 overflow-auto"
        />
      </Card>

      {/* Decomposed Form Modals */}
      <BranchFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        mode="create"
        initialValues={defaultCreateValues}
        parentBranchOptions={parentBranchOptions}
        addressOptions={addressOptions}
        onSubmit={handleCreateSubmit}
        isSubmitting={isSubmitting}
      />

      <BranchFormModal
        isOpen={Boolean(editingBranch)}
        onClose={() => setEditingBranch(null)}
        mode="edit"
        initialValues={editInitialValues}
        parentBranchOptions={parentBranchOptions}
        addressOptions={addressOptions}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Decomposed Protective Danger Modal */}
      <BranchDangerModal
        branch={archivingBranch}
        isOpen={Boolean(archivingBranch)}
        onClose={() => setArchivingBranch(null)}
        onConfirm={handleArchiveConfirm}
        isProcessing={isSubmitting}
      />
    </div>
  );
}
