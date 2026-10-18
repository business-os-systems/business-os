import React from "react";
import { z } from "zod";
import {
  Badge,
  PencilIcon,
  PowerIcon,
  TrashIcon,
} from "@suite/ui";
import type {
  FormConfig,
  FormFieldOption,
  TableConfig,
} from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import type { BranchListItemDto } from "@/services/branches.service";

export interface BranchFormValues {
  name: string;
  code: string;
  type: string;
  parentBranchId?: string;
  timezone: string;
  nightAuditHour: number;
  currency: string;
  locale: string;
  dateFormat: string;
  timeFormat: string;
  taxIdentifier?: string;
  capabilities: string[];
}

export const DEFAULT_BRANCH_CONFIG: BranchFormValues = {
  name: "",
  code: "",
  type: "homestay",
  parentBranchId: "",
  timezone: "Asia/Kolkata",
  nightAuditHour: 4,
  currency: "INR",
  locale: "en-IN",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "12h",
  taxIdentifier: "",
  capabilities: ["lodging"],
};

export const NO_PARENT_BRANCH_OPTION: FormFieldOption = {
  label: "None (Independent Primary Site)",
  value: "",
};

/**
 * Deterministically generates an uppercase branch code acronym from name.
 * e.g. "River View Cafe" -> "RVC-01"
 * e.g. "Manali" -> "MANALI-01"
 */
export function generateBranchCodeFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const words = trimmed
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  if (words.length === 1 && words[0]) {
    const single = words[0].toUpperCase().slice(0, 10);
    return `${single}-01`;
  }

  const acronym = words
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 8);

  return `${acronym}-01`;
}

export const branchValidationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Branch name must be at least 2 characters")
    .max(191, "Branch name cannot exceed 191 characters"),
  code: z
    .string()
    .trim()
    .min(2, "Branch code must be at least 2 characters")
    .max(32, "Branch code cannot exceed 32 characters")
    .regex(
      /^[A-Z0-9_-]+$/,
      "Code must contain only uppercase alphanumeric characters, hyphens, and underscores"
    ),
  type: z.string().trim().min(2, "Please select an operational venue type"),
  parentBranchId: z.string().trim().optional(),
  timezone: z.string().trim().min(2, "Timezone is required"),
  nightAuditHour: z.coerce.number().min(0).max(23),
  currency: z.string().trim().length(3, "Currency must be a 3-letter ISO code"),
  locale: z.string().trim().min(2, "Locale is required"),
  dateFormat: z.string().trim().min(2, "Date format is required"),
  timeFormat: z.string().trim().min(2, "Time format is required"),
  taxIdentifier: z.string().trim().max(64).optional(),
  capabilities: z.array(z.string()).default([]),
});

export interface BranchStatusFilterOption {
  id: string;
  label: string;
}

export const BRANCH_STATUS_FILTERS: readonly BranchStatusFilterOption[] = [
  { id: "ALL", label: "All Sites" },
  { id: "ACTIVE", label: "Active" },
  { id: "TEMPORARILY_CLOSED", label: "Seasonal / Closed" },
  { id: "ARCHIVED", label: "Archived" },
] as const;

export const DEFAULT_BRANCH_TYPES: FormFieldOption[] = [
  { label: "Hotel / Resort", value: "hotel" },
  { label: "Homestay / B&B", value: "homestay" },
  { label: "Restaurant", value: "restaurant" },
  { label: "Cafe / Bistro", value: "cafe" },
  { label: "Retail Store", value: "retail" },
  { label: "Central Warehouse", value: "warehouse" },
  { label: "Salon / Spa", value: "salon" },
  { label: "Corporate Office", value: "office" },
  { label: "Other / Custom", value: "other" },
];

export const TIMEZONE_OPTIONS: FormFieldOption[] = [
  { label: "Asia/Kolkata (IST, UTC+5:30)", value: "Asia/Kolkata" },
  { label: "UTC (Coordinated Universal Time)", value: "UTC" },
  { label: "America/New_York (EST/EDT)", value: "America/New_York" },
  { label: "America/Los_Angeles (PST/PDT)", value: "America/Los_Angeles" },
  { label: "Europe/London (GMT/BST)", value: "Europe/London" },
  { label: "Europe/Paris (CET/CEST)", value: "Europe/Paris" },
  { label: "Asia/Dubai (GST, UTC+4)", value: "Asia/Dubai" },
  { label: "Asia/Singapore (SGT, UTC+8)", value: "Asia/Singapore" },
];

export const NIGHT_AUDIT_OPTIONS: FormFieldOption[] = [
  { label: "00:00 (Midnight)", value: "0" },
  { label: "01:00 AM", value: "1" },
  { label: "02:00 AM", value: "2" },
  { label: "03:00 AM", value: "3" },
  { label: "04:00 AM (Recommended Default)", value: "4" },
  { label: "05:00 AM", value: "5" },
  { label: "06:00 AM", value: "6" },
];

export const DATE_FORMAT_OPTIONS: FormFieldOption[] = [
  { label: "DD/MM/YYYY (e.g. 31/12/2026)", value: "DD/MM/YYYY" },
  { label: "YYYY-MM-DD (ISO Standard)", value: "YYYY-MM-DD" },
  { label: "MM/DD/YYYY (e.g. 12/31/2026)", value: "MM/DD/YYYY" },
];

export const TIME_FORMAT_OPTIONS: FormFieldOption[] = [
  { label: "12-hour (AM / PM)", value: "12h" },
  { label: "24-hour (Military / Railway)", value: "24h" },
];

export const BRANCH_LOCALE_OPTIONS: FormFieldOption[] = [
  { label: "English (India) — en-IN", value: "en-IN" },
  { label: "English (United States) — en-US", value: "en-US" },
  { label: "English (United Kingdom) — en-GB", value: "en-GB" },
  { label: "Hindi (India) — hi-IN", value: "hi-IN" },
  { label: "Universal English — en", value: "en" },
];

export const BRANCH_CAPABILITY_OPTIONS = [
  { id: "lodging", label: "Lodging (PMS)" },
  { id: "dining", label: "Dining (POS)" },
  { id: "retail", label: "Retail (POS)" },
  { id: "inventory", label: "Inventory" },
  { id: "events", label: "Events & Banquets" },
  { id: "wellness", label: "Spa & Wellness" },
] as const;

export function createBranchFormConfig(
  mode: "create" | "edit" = "create",
  customTypes: FormFieldOption[] = DEFAULT_BRANCH_TYPES
): FormConfig<BranchFormValues> {
  const isEdit = mode === "edit";

  return {
    id: `branch-${mode}-form`,
    title: isEdit ? "Edit Operational Branch" : "Register New Operational Branch",
    description: isEdit
      ? "Update operational parameters, turnover clock, and tax credentials."
      : "Register an execution site, terminal location, or store outlet.",
    sections: [
      {
        id: "branch-identity",
        title: "Branch Identity & Classification",
        description: "Primary name, unique code, and venue classification.",
        permission: PERMISSIONS.CORE.BRANCHES_WRITE,
        fields: [
          {
            name: "name",
            label: "Branch Name",
            type: "text",
            placeholder: "e.g. River View Manali Main Lodge",
            description: "Display name shown across staff terminals and receipts.",
            required: true,
            colSpan: 1,
          },
          {
            name: "code",
            label: isEdit ? "Branch Code (Locked)" : "Branch Code",
            type: "text",
            placeholder: "e.g. MANALI-01",
            description: isEdit
              ? "Branch code is permanent and cannot be modified."
              : "Unique uppercase identifier for receipts, barcodes, and shifts.",
            required: true,
            disabled: isEdit,
            colSpan: 1,
          },
          {
            name: "type",
            label: "Venue Type",
            type: "select",
            description: "Primary operational classification for this site.",
            options: customTypes,
            required: true,
            colSpan: 2,
          },
        ],
      },
      {
        id: "branch-operations",
        title: "Operational Clock & Turnover (Ground Reality)",
        description: "Local IANA timezone and night audit rollover hour.",
        fields: [
          {
            name: "timezone",
            label: "Local Timezone",
            type: "select",
            options: TIMEZONE_OPTIONS,
            description: "Timezone used for timestamping shifts and folio turnover.",
            required: true,
            colSpan: 1,
          },
          {
            name: "nightAuditHour",
            label: "Night Audit Rollover Hour",
            type: "select",
            options: NIGHT_AUDIT_OPTIONS,
            description: "Operational cutoff hour when business day officially flips.",
            required: true,
            colSpan: 1,
          },
        ],
      },
      {
        id: "branch-localization",
        title: "Localization & State Tax",
        description: "Currency, date formats, and optional branch-specific tax ID.",
        fields: [
          {
            name: "currency",
            label: "Operational Currency",
            type: "text",
            placeholder: "INR",
            description: "3-letter ISO currency code.",
            required: true,
            colSpan: 1,
          },
          {
            name: "taxIdentifier",
            label: "Branch Tax ID (GSTIN / VAT / State TIN)",
            type: "text",
            placeholder: "e.g. 02AAAAA0000A1Z5",
            description: "State-specific tax registration number for this outlet.",
            colSpan: 1,
          },
          {
            name: "dateFormat",
            label: "Date Format",
            type: "select",
            options: DATE_FORMAT_OPTIONS,
            colSpan: 1,
          },
          {
            name: "timeFormat",
            label: "Time Format",
            type: "select",
            options: TIME_FORMAT_OPTIONS,
            colSpan: 1,
          },
        ],
      },
    ],
  };
}

export interface BranchTableConfigOptions {
  activeBranchId?: string;
  onEdit: (branch: BranchListItemDto) => void;
  onToggleStatus: (branch: BranchListItemDto) => void;
  onArchive: (branch: BranchListItemDto) => void;
  onSwitchBranch?: (branch: BranchListItemDto) => void;
  onAddBranch?: () => void;
}

export function createBranchTableConfig(
  options: BranchTableConfigOptions
): TableConfig<BranchListItemDto> {
  const { activeBranchId, onEdit, onToggleStatus, onArchive, onAddBranch } = options;

  return {
    id: "branches-directory-table",
    columns: [
      {
        key: "name",
        header: "Branch",
        sortable: true,
        render: (_value, row) => (
          <div>
            <div className="font-semibold text-text flex items-center gap-2">
              <span>{row.name}</span>
              {activeBranchId === row.id && (
                <Badge variant="success">
                  Current Scope
                </Badge>
              )}
            </div>
            {row.address && (
              <p className="text-[11px] text-text-muted mt-0.5">
                {row.address.city}, {row.address.state}
              </p>
            )}
          </div>
        ),
      },
      {
        key: "code",
        header: "Code",
        sortable: true,
        render: (value) => (
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-subtle border border-border text-text font-semibold">
            {String(value)}
          </span>
        ),
      },
      {
        key: "type",
        header: "Venue Type",
        sortable: true,
        render: (value) => {
          const typeStr = String(value || "");
          const match = DEFAULT_BRANCH_TYPES.find((t) => t.value === typeStr);
          return <span className="capitalize">{match ? match.label : typeStr}</span>;
        },
      },
      {
        key: "capabilities",
        header: "Capabilities",
        render: (_val, row) => {
          const caps = row.capabilities || [];
          if (caps.length === 0) {
            return <span className="text-text-muted text-[11px]">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {caps.slice(0, 3).map((cap) => (
                <span
                  key={cap}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-subtle border border-border text-text-secondary capitalize"
                >
                  {cap}
                </span>
              ))}
              {caps.length > 3 && (
                <span className="text-[10px] text-text-muted self-center">
                  +{caps.length - 3}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (value) => {
          if (value === "ARCHIVED") {
            return <Badge variant="destructive">Archived</Badge>;
          }
          if (value === "TEMPORARILY_CLOSED") {
            return <Badge variant="outline">Closed</Badge>;
          }
          return <Badge variant="success">Active</Badge>;
        },
      },
      {
        key: "timezone",
        header: "Timezone / Turnover",
        sortable: true,
        render: (_value, row) => (
          <div className="text-xs text-text-muted">
            <div>{row.timezone}</div>
            <div className="text-[11px] text-text-muted/80">
              Rollover: {row.nightAuditHour.toString().padStart(2, "0")}:00 AM
            </div>
          </div>
        ),
      },
    ],
    actions: [
      {
        id: "edit-branch",
        label: "Edit Settings",
        tooltip: "Edit Branch Configuration",
        variant: "outline",
        permission: PERMISSIONS.CORE.BRANCHES_WRITE,
        renderIcon: () => <PencilIcon className="h-3.5 w-3.5 text-text" />,
        isVisible: (branch) => branch.status !== "ARCHIVED",
        onClick: (branch) => onEdit(branch),
      },
      {
        id: "toggle-status",
        label: (branch) => (branch.status === "ACTIVE" ? "Temporarily Close" : "Reopen Branch"),
        tooltip: (branch) =>
          branch.status === "ACTIVE"
            ? "Temporarily Close Branch (Seasonal/Maintenance)"
            : "Reopen Branch to Active Operations",
        variant: "outline",
        permission: PERMISSIONS.CORE.BRANCHES_WRITE,
        renderIcon: (branch) => (
          <PowerIcon
            className={`h-3.5 w-3.5 ${
              branch.status === "ACTIVE" ? "text-text-muted" : "text-action"
            }`}
          />
        ),
        isVisible: (branch) => branch.status !== "ARCHIVED",
        onClick: (branch) => onToggleStatus(branch),
      },
      {
        id: "archive-branch",
        label: "Archive Branch",
        tooltip: "Archive Branch (Irreversible)",
        variant: "outline",
        permission: PERMISSIONS.CORE.BRANCHES_WRITE,
        renderIcon: () => <TrashIcon className="h-3.5 w-3.5 text-danger" />,
        isVisible: (branch) => branch.status !== "ARCHIVED",
        onClick: (branch) => onArchive(branch),
      },
    ],
    emptyState: {
      title: "No Branches Configured",
      description: "Get started by registering your first physical branch or outlet.",
      actionLabel: "+ Add Branch",
      onAction: onAddBranch,
    },
  };
}
