import React from "react";
import { z } from "zod";
import {
  PencilIcon,
  TrashIcon,
  MapPinIcon,
} from "@suite/ui";
import type {
  FormConfig,
  TableConfig,
} from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import type { AddressListItemDto } from "@/services/addresses.service";

export interface AddressFormValues {
  addressType: "URBAN" | "RURAL";
  streetAddress?: string;
  landmark?: string;
  city?: string;
  village?: string;
  postOffice?: string;
  district?: string;
  state: string;
  postalCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string;
  mapUrl?: string;
}

export const DEFAULT_ADDRESS_CONFIG: AddressFormValues = {
  addressType: "URBAN",
  streetAddress: "",
  landmark: "",
  city: "",
  village: "",
  postOffice: "",
  district: "",
  state: "",
  postalCode: "",
  country: "IN",
  latitude: null,
  longitude: null,
  googlePlaceId: "",
  mapUrl: "",
};

const baseFormSchema = {
  landmark: z.string().trim().max(191).optional(),
  state: z
    .string()
    .trim()
    .min(1, "State is required")
    .max(100, "State cannot exceed 100 characters"),
  postalCode: z
    .string()
    .trim()
    .min(1, "Postal / PIN code is required")
    .max(20, "Postal code cannot exceed 20 characters"),
  country: z
    .string()
    .trim()
    .length(2, "Country code must be 2 characters (ISO-3166)")
    .default("IN"),
  latitude: z
    .union([z.number(), z.string().transform((v) => (v === "" ? null : Number(v)))])
    .pipe(z.number().min(-90).max(90).nullable())
    .optional(),
  longitude: z
    .union([z.number(), z.string().transform((v) => (v === "" ? null : Number(v)))])
    .pipe(z.number().min(-180).max(180).nullable())
    .optional(),
  googlePlaceId: z.string().trim().max(255).optional(),
  mapUrl: z.string().trim().optional(),
};

export const addressValidationSchema = z.discriminatedUnion("addressType", [
  z.object({
    addressType: z.literal("URBAN"),
    streetAddress: z
      .string()
      .trim()
      .min(2, "Street address must be at least 2 characters")
      .max(255, "Street address cannot exceed 255 characters"),
    city: z
      .string()
      .trim()
      .min(1, "City is required")
      .max(100, "City cannot exceed 100 characters"),
    village: z.string().optional(),
    postOffice: z.string().optional(),
    district: z.string().optional(),
    ...baseFormSchema,
  }),
  z.object({
    addressType: z.literal("RURAL"),
    village: z
      .string()
      .trim()
      .min(1, "Village is required")
      .max(191, "Village cannot exceed 191 characters"),
    postOffice: z
      .string()
      .trim()
      .min(1, "Post office is required")
      .max(191, "Post office cannot exceed 191 characters"),
    district: z
      .string()
      .trim()
      .min(1, "District is required")
      .max(100, "District cannot exceed 100 characters"),
    streetAddress: z.string().optional(),
    city: z.string().optional(),
    ...baseFormSchema,
  }),
]);

export function createAddressFormConfig(
  mode: "create" | "edit" = "create"
): FormConfig<AddressFormValues> {
  return {
    id: "address-management-form",
    title: mode === "create" ? "Add Operational Address" : "Edit Operational Address",
    description: "Manage physical postal location, landmarks, and geospatial map coordinates.",
    sections: [
      {
        id: "postal-section",
        title: "Postal Information",
        description: "Official location coordinates.",
        fields: [
          {
            name: "addressType",
            label: "Address Classification",
            type: "select",
            options: [
              { label: "Urban (Street & City)", value: "URBAN" },
              { label: "Rural (Village, PO & District)", value: "RURAL" },
            ],
            required: true,
            colSpan: 2,
          },
          {
            name: "streetAddress",
            label: "Street Address",
            type: "text",
            placeholder: "Flat / Building, Street, Area / Sector",
            required: true,
            colSpan: 2,
          },
          {
            name: "landmark",
            label: "Landmark / Locality",
            type: "text",
            placeholder: "e.g. Near Hadimba Temple / Panchayat Bhavan",
            required: false,
            colSpan: 2,
          },
          {
            name: "city",
            label: "City",
            type: "text",
            placeholder: "e.g. Manali",
            required: true,
            colSpan: 1,
          },
          {
            name: "state",
            label: "State / Province",
            type: "text",
            placeholder: "e.g. Himachal Pradesh",
            required: true,
            colSpan: 1,
          },
          {
            name: "postalCode",
            label: "Postal / PIN Code",
            type: "text",
            placeholder: "e.g. 175131",
            required: true,
            colSpan: 1,
          },
          {
            name: "country",
            label: "Country",
            type: "text",
            placeholder: "IN",
            required: true,
            colSpan: 1,
          },
        ],
      },
      {
        id: "geospatial-section",
        title: "Geospatial & Navigation Coordinates",
        description: "High-precision GPS coordinates and Google Maps location URLs.",
        fields: [
          {
            name: "latitude",
            label: "Latitude",
            type: "number",
            placeholder: "e.g. 32.2396",
            required: false,
            colSpan: 1,
          },
          {
            name: "longitude",
            label: "Longitude",
            type: "number",
            placeholder: "e.g. 77.1887",
            required: false,
            colSpan: 1,
          },
          {
            name: "googlePlaceId",
            label: "Google Place ID",
            type: "text",
            placeholder: "ChIJ...",
            required: false,
            colSpan: 1,
          },
          {
            name: "mapUrl",
            label: "Google Maps URL",
            type: "text",
            placeholder: "https://maps.google.com/?q=...",
            required: false,
            colSpan: 1,
          },
        ],
      },
    ],
  };
}

export interface AddressTableConfigOptions {
  onEdit: (address: AddressListItemDto) => void;
  onDelete: (address: AddressListItemDto) => void;
  onAddAddress?: () => void;
}

export function createAddressTableConfig(
  options: AddressTableConfigOptions
): TableConfig<AddressListItemDto> {
  const { onEdit, onDelete, onAddAddress } = options;

  return {
    id: "addresses-directory-table",
    columns: [
      {
        key: "formattedAddress",
        header: "Physical / Operational Address",
        sortable: true,
        render: (_value, row) => (
          <div>
            <div className="font-semibold text-text flex items-center gap-1.5 flex-wrap">
              <MapPinIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
              <span>
                {row.addressType === "RURAL"
                  ? `${row.village || "Village"}, PO: ${row.postOffice || ""}, Dist: ${row.district || ""}`
                  : row.streetAddress || row.formattedAddress}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                  row.addressType === "RURAL"
                    ? "bg-action-tint text-action border-action/30"
                    : "bg-surface-sunken text-text-secondary border-border"
                }`}
              >
                {row.addressType === "RURAL" ? "Rural" : "Urban"}
              </span>
            </div>
            {row.landmark && (
              <p className="text-[11px] text-text-muted mt-0.5">
                Landmark: {row.landmark}
              </p>
            )}
          </div>
        ),
      },
      {
        key: "city",
        header: "Region & PIN",
        sortable: true,
        render: (_value, row) => (
          <div className="text-xs text-text">
            <span>
              {row.addressType === "RURAL"
                ? `${row.district || "—"}, ${row.state}`
                : `${row.city || "—"}, ${row.state}`}
            </span>
            <div className="text-[11px] text-text-muted">{row.postalCode}</div>
          </div>
        ),
      },
      {
        key: "country",
        header: "Country",
        sortable: true,
        render: (value) => (
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-subtle border border-border text-text font-semibold">
            {String(value || "IN")}
          </span>
        ),
      },
      {
        key: "linkedBranchesCount",
        header: "Active Linking",
        render: (_val, row) => {
          const badges: React.ReactNode[] = [];

          if (row.isOrgRegisteredAddress) {
            badges.push(
              <span
                key="org-hq"
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-subtle text-text whitespace-nowrap"
              >
                HQ Legal Profile
              </span>
            );
          }

          if (row.linkedBranches.length > 0) {
            row.linkedBranches.forEach((b) => {
              badges.push(
                <span
                  key={b.id}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-subtle text-text whitespace-nowrap"
                  title={`Branch: ${b.name}`}
                >
                  {b.name} ({b.code})
                </span>
              );
            });
          }

          if (badges.length === 0) {
            return (
              <span className="text-[11px] text-text-muted italic">
                Unlinked (Standby)
              </span>
            );
          }

          return <div className="flex flex-wrap gap-1.5">{badges}</div>;
        },
      },
      {
        key: "latitude",
        header: "Coordinates / Map",
        render: (_val, row) => {
          const hasCoords = row.latitude !== null && row.longitude !== null;
          return (
            <div className="text-xs text-text-muted flex items-center gap-2">
              {hasCoords ? (
                <span className="font-mono text-[11px]">
                  {Number(row.latitude).toFixed(4)}, {Number(row.longitude).toFixed(4)}
                </span>
              ) : (
                <span className="text-[11px]">—</span>
              )}
              {row.mapUrl && (
                <a
                  href={row.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action hover:underline text-[11px] font-medium"
                >
                  Map ↗
                </a>
              )}
            </div>
          );
        },
      },
    ],
    actions: [
      {
        id: "edit-address",
        label: "Edit Address",
        tooltip: "Edit Address Details",
        variant: "outline",
        permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
        renderIcon: () => <PencilIcon className="h-3.5 w-3.5 text-text" />,
        onClick: (address) => onEdit(address),
      },
      {
        id: "delete-address",
        label: "Delete Address",
        tooltip: (address) =>
          address.isDeletable
            ? "Delete Address Permanently"
            : (address.inUseReason || "Cannot delete address actively linked to organization or branches"),
        variant: "outline",
        permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
        renderIcon: () => <TrashIcon className="h-3.5 w-3.5 text-danger" />,
        onClick: (address) => onDelete(address),
      },
    ],
    emptyState: {
      title: "No Operational Addresses Found",
      description: "Register physical facilities, central offices, and operational sites.",
      actionLabel: "+ Add Address",
      onAction: onAddAddress,
    },
  };
}
