"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Select } from "@suite/ui";
import type { FormFieldOption } from "@suite/ui";
import {
  DEFAULT_BRANCH_TYPES,
  TIMEZONE_OPTIONS,
  NIGHT_AUDIT_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  BRANCH_LOCALE_OPTIONS,
  BRANCH_CAPABILITY_OPTIONS,
  generateBranchCodeFromName,
  type BranchFormValues,
} from "../branches.config";

export interface BranchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialValues: BranchFormValues;
  parentBranchOptions: FormFieldOption[];
  addressOptions?: FormFieldOption[];
  onSubmit: (values: BranchFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function BranchFormModal({
  isOpen,
  onClose,
  mode,
  initialValues,
  parentBranchOptions,
  addressOptions = [],
  onSubmit,
  isSubmitting = false,
}: BranchFormModalProps) {
  const [form, setForm] = useState<BranchFormValues>(initialValues);
  const [isCodeCustomized, setIsCodeCustomized] = useState(false);
  const isEdit = mode === "edit";

  useEffect(() => {
    setForm(initialValues);
    setIsCodeCustomized(Boolean(isEdit && initialValues.code));
  }, [initialValues, isOpen, isEdit]);

  const handleNameChange = (name: string) => {
    if (isEdit) {
      setForm((prev) => ({ ...prev, name }));
      return;
    }

    const suggestedCode = generateBranchCodeFromName(name);

    setForm((prev) => ({
      ...prev,
      name,
      code: isCodeCustomized ? prev.code : suggestedCode,
    }));
  };

  const toggleCapability = (capId: string) => {
    setForm((prev) => {
      const has = prev.capabilities.includes(capId);
      return {
        ...prev,
        capabilities: has
          ? prev.capabilities.filter((c) => c !== capId)
          : [...prev.capabilities, capId],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(form);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Operational Branch" : "Register Operational Branch"}
      size="xl"
      className="max-w-4xl"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs h-8 px-3"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="branch-form"
            size="sm"
            disabled={isSubmitting}
            className="text-xs font-semibold h-8 px-4"
          >
            {isSubmitting
              ? isEdit
                ? "Saving..."
                : "Registering..."
              : isEdit
              ? "Save Changes"
              : "Register Branch"}
          </Button>
        </div>
      }
    >
      <form id="branch-form" onSubmit={handleSubmit} className="space-y-3">
        {/* Row 1: Identity & Classification */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-medium text-text mb-1">
              Branch Name <span className="text-brand">*</span>
            </label>
            <Input
              placeholder="e.g. Manali Riverside Retreat"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="text-xs h-9"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Branch Code <span className="text-brand">*</span>
            </label>
            <Input
              placeholder="e.g. MANALI-01"
              value={form.code}
              onChange={(e) => {
                if (!isEdit) {
                  setIsCodeCustomized(true);
                  setForm((p) => ({
                    ...p,
                    code: e.target.value.toUpperCase(),
                  }));
                }
              }}
              disabled={isEdit}
              required
              className={`font-mono text-xs h-9 ${
                isEdit
                  ? "bg-surface-subtle text-text-muted cursor-not-allowed border-border"
                  : ""
              }`}
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Venue Type <span className="text-brand">*</span>
            </label>
            <Select
              value={form.type}
              onChange={(val) => setForm((p) => ({ ...p, type: val }))}
              options={DEFAULT_BRANCH_TYPES}
              className="text-xs"
            />
          </div>
        </div>

        {/* Row 2: Hierarchy, Physical Site Address, Tax & Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Parent Hierarchy
            </label>
            <Select
              value={form.parentBranchId ?? ""}
              onChange={(val) =>
                setForm((p) => ({
                  ...p,
                  parentBranchId: val || undefined,
                }))
              }
              options={parentBranchOptions}
              className="text-xs"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Operational Site Address
            </label>
            <Select
              value={form.addressId ?? ""}
              onChange={(val) =>
                setForm((p) => ({
                  ...p,
                  addressId: val || undefined,
                }))
              }
              options={[
                { label: "None (Unassigned)", value: "" },
                ...addressOptions,
              ]}
              className="text-xs"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Tax ID (GSTIN / TIN)
            </label>
            <Input
              placeholder="e.g. 02AAAAA0000A1Z5"
              value={form.taxIdentifier ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  taxIdentifier: e.target.value,
                }))
              }
              className="font-mono text-xs h-9 uppercase"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Currency <span className="text-brand">*</span>
            </label>
            <Input
              placeholder="INR"
              value={form.currency}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  currency: e.target.value.toUpperCase(),
                }))
              }
              maxLength={3}
              required
              className="font-mono text-xs h-9 uppercase"
            />
          </div>
        </div>

        {/* Row 3: Operational Clock & Formats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Timezone <span className="text-brand">*</span>
            </label>
            <Select
              value={form.timezone}
              onChange={(val) => setForm((p) => ({ ...p, timezone: val }))}
              options={TIMEZONE_OPTIONS}
              className="text-xs"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Night Audit Hour <span className="text-brand">*</span>
            </label>
            <Select
              value={String(form.nightAuditHour)}
              onChange={(val) =>
                setForm((p) => ({
                  ...p,
                  nightAuditHour: Number(val),
                }))
              }
              options={NIGHT_AUDIT_OPTIONS}
              className="text-xs"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Date Format
            </label>
            <Select
              value={form.dateFormat}
              onChange={(val) => setForm((p) => ({ ...p, dateFormat: val }))}
              options={DATE_FORMAT_OPTIONS}
              className="text-xs"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              Time Format
            </label>
            <Select
              value={form.timeFormat}
              onChange={(val) => setForm((p) => ({ ...p, timeFormat: val }))}
              options={TIME_FORMAT_OPTIONS}
              className="text-xs"
            />
          </div>
        </div>

        {/* Row 4: Locale & Capabilities */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-start">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-text mb-1">
              System Locale
            </label>
            <Select
              value={form.locale}
              onChange={(val) => setForm((p) => ({ ...p, locale: val }))}
              options={BRANCH_LOCALE_OPTIONS}
              className="text-xs"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-text mb-1">
              Operational Capabilities
            </label>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {BRANCH_CAPABILITY_OPTIONS.map((cap) => {
                const isChecked = form.capabilities.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => toggleCapability(cap.id)}
                    className={`px-2 py-1 text-[11px] rounded-md font-medium border transition-colors cursor-pointer ${
                      isChecked
                        ? "bg-brand text-on-brand border-brand shadow-xs"
                        : "bg-surface text-text-muted hover:text-text border-border"
                    }`}
                  >
                    {cap.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
