"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast, Card, cn, ConfigTableRenderer } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { httpClient } from "@/lib/http-client";
import type { AddressListItemDto } from "@/services/addresses.service";
import {
  createAddressTableConfig,
  type AddressFormValues,
} from "./addresses.config";
import { AddressTableToolbar } from "./components/address-table-toolbar";
import { AddressFormModal } from "./components/address-form-modal";
import { AddressDangerModal } from "./components/address-danger-modal";

export interface AddressesClientProps {
  initialAddresses: AddressListItemDto[];
  organizationId: string;
  userPermissions?: string[];
}

interface ApiProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  inUseReason?: string;
  errors?: Record<string, string[]> | ({ message?: string } | string)[];
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
  }
  return fallback;
}

export function AddressesClient({
  initialAddresses,
  organizationId: _organizationId,
  userPermissions = [],
}: AddressesClientProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<AddressListItemDto[]>(initialAddresses);
  const [filter, setFilter] = useState<"ALL" | "LINKED" | "UNLINKED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressListItemDto | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<AddressListItemDto | null>(null);

  const canWrite =
    hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_UPDATE) ||
    hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_WRITE);

  const filteredAddresses = useMemo(() => {
    return addresses.filter((item) => {
      // Filter tab
      if (filter === "LINKED") {
        const isLinked = item.isOrgRegisteredAddress || item.linkedBranches.length > 0;
        if (!isLinked) return false;
      } else if (filter === "UNLINKED") {
        const isLinked = item.isOrgRegisteredAddress || item.linkedBranches.length > 0;
        if (isLinked) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const streetMatch = item.streetAddress?.toLowerCase().includes(q) ?? false;
        const villageMatch = item.village?.toLowerCase().includes(q) ?? false;
        const poMatch = item.postOffice?.toLowerCase().includes(q) ?? false;
        const distMatch = item.district?.toLowerCase().includes(q) ?? false;
        const landmarkMatch = item.landmark?.toLowerCase().includes(q) ?? false;
        const cityMatch = item.city?.toLowerCase().includes(q) ?? false;
        const stateMatch = item.state.toLowerCase().includes(q);
        const postalMatch = item.postalCode.toLowerCase().includes(q);
        const branchMatch = item.linkedBranches.some((b) =>
          b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)
        );
        return (
          streetMatch ||
          villageMatch ||
          poMatch ||
          distMatch ||
          landmarkMatch ||
          cityMatch ||
          stateMatch ||
          postalMatch ||
          branchMatch
        );
      }

      return true;
    });
  }, [addresses, filter, searchQuery]);

  const handleCreateSubmit = async (values: AddressFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await httpClient.post<{ data: AddressListItemDto }>(
        "/api/v1/settings/addresses",
        values
      );

      if (!response.ok) {
        toast.error(extractApiErrorMessage(response.data, "Failed to register address."));
        return;
      }

      const created = response.data.data;
      const locationLabel =
        created.addressType === "RURAL"
          ? created.village || created.district || "Rural"
          : created.city || "Urban";
      toast.success(`Operational address in ${locationLabel} was created successfully.`);

      setAddresses((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, "Failed to register address.");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (values: AddressFormValues) => {
    if (!editingAddress) return;
    setIsSubmitting(true);
    try {
      const response = await httpClient.patch<{ data: AddressListItemDto }>(
        `/api/v1/settings/addresses/${editingAddress.id}`,
        values
      );

      if (!response.ok) {
        toast.error(extractApiErrorMessage(response.data, "Failed to update address."));
        return;
      }

      const updated = response.data.data;
      const locationLabel =
        updated.addressType === "RURAL"
          ? updated.village || updated.district || "Rural"
          : updated.city || "Urban";
      toast.success(`Operational address in ${locationLabel} was updated successfully.`);

      setAddresses((prev) =>
        prev.map((a) => (a.id === editingAddress.id ? updated : a))
      );
      setEditingAddress(null);
      router.refresh();
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, "Failed to update address.");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAddress) return;
    setIsSubmitting(true);
    try {
      const response = await httpClient.delete<{ success: boolean; message?: string }>(
        `/api/v1/settings/addresses/${deletingAddress.id}`
      );

      if (!response.ok) {
        toast.error(extractApiErrorMessage(response.data, "Failed to delete address."));
        return;
      }

      toast.success("Operational address has been removed permanently.");

      setAddresses((prev) => prev.filter((a) => a.id !== deletingAddress.id));
      setDeletingAddress(null);
      router.refresh();
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, "Failed to delete address.");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tableConfig = useMemo(
    () =>
      createAddressTableConfig({
        onEdit: (addr) => setEditingAddress(addr),
        onDelete: (addr) => setDeletingAddress(addr),
        onAddAddress: () => setIsCreateOpen(true),
      }),
    []
  );

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Page Header (Sticky) */}
      <div className="shrink-0 bg-background pb-3 border-b border-border sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Operational Addresses &amp; Sites
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage physical facility locations, postal coordinates, and geospatial navigation points.
          </p>
        </div>
      </div>

      {/* Toolbar (Sticky) */}
      <div className="shrink-0 bg-background sticky top-[57px] z-20">
        <AddressTableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filter={filter}
          onFilterChange={setFilter}
          canWrite={canWrite}
          onAddAddress={() => setIsCreateOpen(true)}
        />
      </div>

      {/* Table View (Scrollable Rows) */}
      <Card className={cn("flex-1 min-h-[300px] overflow-hidden border border-border bg-surface p-0 shadow-2xs flex flex-col")}>
        <ConfigTableRenderer
          config={tableConfig}
          rowKey={(row) => row.id}
          data={filteredAddresses}
          userPermissions={userPermissions}
          className="border-0 rounded-none shadow-none flex-1 min-h-0 overflow-auto"
        />
      </Card>

      {/* Add Address Modal */}
      <AddressFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        mode="create"
        onSubmit={handleCreateSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Edit Address Modal */}
      <AddressFormModal
        isOpen={Boolean(editingAddress)}
        onClose={() => setEditingAddress(null)}
        mode="edit"
        initialValues={
          editingAddress
            ? {
                addressType: editingAddress.addressType,
                streetAddress: editingAddress.streetAddress || "",
                village: editingAddress.village || "",
                postOffice: editingAddress.postOffice || "",
                district: editingAddress.district || "",
                landmark: editingAddress.landmark || "",
                city: editingAddress.city || "",
                state: editingAddress.state,
                postalCode: editingAddress.postalCode,
                country: editingAddress.country,
                latitude: editingAddress.latitude,
                longitude: editingAddress.longitude,
                googlePlaceId: editingAddress.googlePlaceId || "",
                mapUrl: editingAddress.mapUrl || "",
              }
            : undefined
        }
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Deletion / Conflict Modal */}
      <AddressDangerModal
        address={deletingAddress}
        isOpen={Boolean(deletingAddress)}
        onClose={() => setDeletingAddress(null)}
        onConfirm={handleDeleteConfirm}
        isProcessing={isSubmitting}
      />
    </div>
  );
}
