"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Select, cn } from "@suite/ui";
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY_CODE } from "@suite/core";
import {
  type AddressFormValues,
  DEFAULT_ADDRESS_CONFIG,
} from "../addresses.config";

export interface AddressFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialValues?: Partial<AddressFormValues>;
  onSubmit: (values: AddressFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function AddressFormModal({
  isOpen,
  onClose,
  mode,
  initialValues = DEFAULT_ADDRESS_CONFIG,
  onSubmit,
  isSubmitting = false,
}: AddressFormModalProps) {
  const [form, setForm] = useState<AddressFormValues>({
    ...DEFAULT_ADDRESS_CONFIG,
    ...initialValues,
  });

  const isEdit = mode === "edit";

  useEffect(() => {
    if (isOpen) {
      setForm({
        ...DEFAULT_ADDRESS_CONFIG,
        ...initialValues,
        country: initialValues.country || DEFAULT_COUNTRY_CODE,
      });
    }
  }, [isOpen, initialValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(form);
  };

  const isRural = form.addressType === "RURAL";

  const isFormValid = isRural
    ? !!(
        form.village?.trim() &&
        form.postOffice?.trim() &&
        form.district?.trim() &&
        form.state.trim() &&
        form.postalCode.trim() &&
        form.country.trim()
      )
    : !!(
        form.streetAddress?.trim() &&
        form.city?.trim() &&
        form.state.trim() &&
        form.postalCode.trim() &&
        form.country.trim()
      );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Operational Address" : "Register Operational Address"}
      size="xl"
      className="max-w-3xl"
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
            form="address-form"
            size="sm"
            disabled={isSubmitting || !isFormValid}
            className="text-xs h-8 px-4"
          >
            {isSubmitting
              ? "Saving..."
              : isEdit
              ? "Update Address"
              : "Register Address"}
          </Button>
        </div>
      }
    >
      <form id="address-form" onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Classification Selector */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <h4 className="text-xs font-semibold text-text uppercase tracking-wider">
              Address Classification
            </h4>
            <p className="text-[11px] text-text-muted">
              Choose location model adapted for urban street coordinates or rural administrative hierarchy.
            </p>
          </div>
          <div
            role="group"
            aria-label="Address Classification"
            className="flex items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-border shrink-0"
          >
            <button
              type="button"
              aria-pressed={!isRural}
              onClick={() =>
                setForm((prev) => ({ ...prev, addressType: "URBAN" }))
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium",
                !isRural
                  ? "bg-action text-on-action font-semibold shadow-xs"
                  : "text-text-secondary hover:text-text hover:bg-surface-hover/80"
              )}
            >
              <span className="text-sm">🏙️</span>
              <span>Urban</span>
            </button>
            <button
              type="button"
              aria-pressed={isRural}
              onClick={() =>
                setForm((prev) => ({ ...prev, addressType: "RURAL" }))
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium",
                isRural
                  ? "bg-action text-on-action font-semibold shadow-xs"
                  : "text-text-secondary hover:text-text hover:bg-surface-hover/80"
              )}
            >
              <span className="text-sm">🌾</span>
              <span>Rural</span>
            </button>
          </div>
        </div>

        {/* Dynamic Section: Postal Coordinates */}
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {isRural ? (
              <>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="addr-village"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    Village / Basti <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="addr-village"
                    type="text"
                    placeholder="e.g. Prini Village / Shuru"
                    value={form.village || ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, village: e.target.value }))
                    }
                    required
                    className="text-xs"
                  />
                </div>

                <div className="col-span-1">
                  <label
                    htmlFor="addr-postOffice"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    Post Office (PO) <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="addr-postOffice"
                    type="text"
                    placeholder="e.g. Jagatsukh PO"
                    value={form.postOffice || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        postOffice: e.target.value,
                      }))
                    }
                    required
                    className="text-xs"
                  />
                </div>

                <div className="col-span-1">
                  <label
                    htmlFor="addr-district"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    District <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="addr-district"
                    type="text"
                    placeholder="e.g. Kullu District"
                    value={form.district || ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, district: e.target.value }))
                    }
                    required
                    className="text-xs"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="addr-street"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    Street Address <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="addr-street"
                    type="text"
                    placeholder="Flat / Building, Street, Area / Sector"
                    value={form.streetAddress || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        streetAddress: e.target.value,
                      }))
                    }
                    required
                    className="text-xs"
                  />
                </div>

                <div className="col-span-1">
                  <label
                    htmlFor="addr-city"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    City <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="addr-city"
                    type="text"
                    placeholder="e.g. Manali / Dehradun"
                    value={form.city || ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, city: e.target.value }))
                    }
                    required
                    className="text-xs"
                  />
                </div>
              </>
            )}

            {/* Row 2: State, PIN, Country */}
            <div className="col-span-1">
              <label
                htmlFor="addr-state"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                State / Province <span className="text-danger">*</span>
              </label>
              <Input
                id="addr-state"
                type="text"
                placeholder="e.g. Himachal Pradesh"
                value={form.state}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, state: e.target.value }))
                }
                required
                className="text-xs"
              />
            </div>

            <div className="col-span-1">
              <label
                htmlFor="addr-postalCode"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                PIN / Postal Code <span className="text-danger">*</span>
              </label>
              <Input
                id="addr-postalCode"
                type="text"
                placeholder="e.g. 175131"
                value={form.postalCode}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, postalCode: e.target.value }))
                }
                required
                className="text-xs"
              />
            </div>

            {/* Country Selector Dropdown */}
            <div className="sm:col-span-2">
              <label
                htmlFor="addr-country"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Country <span className="text-danger">*</span>
              </label>
              <Select
                id="addr-country"
                value={form.country || DEFAULT_COUNTRY_CODE}
                direction="down"
                options={COUNTRY_OPTIONS.map((c) => ({
                  value: c.value,
                  label: c.label,
                }))}
                onChange={(val) =>
                  setForm((prev) => ({ ...prev, country: val }))
                }
                className="text-xs"
              />
            </div>

            {/* Row 3: Landmark / Notable Reference */}
            <div className="sm:col-span-4">
              <label
                htmlFor="addr-landmark"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Landmark / Notable Reference
              </label>
              <Input
                id="addr-landmark"
                type="text"
                placeholder={
                  isRural
                    ? "e.g. Near Panchayat Bhavan / Old Pine Tree"
                    : "e.g. Near Hadimba Temple / Mall Road"
                }
                value={form.landmark || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, landmark: e.target.value }))
                }
                className="text-xs"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Geospatial Coordinates & Google Maps */}
        <div className="pt-2 border-t border-border">
          <h4 className="text-xs font-semibold text-text uppercase tracking-wider mb-2">
            Geospatial & Navigation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-1">
              <label
                htmlFor="addr-lat"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Latitude
              </label>
              <Input
                id="addr-lat"
                type="number"
                step="any"
                placeholder="e.g. 32.2396"
                value={
                  form.latitude !== null && form.latitude !== undefined
                    ? form.latitude
                    : ""
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    latitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="text-xs font-mono"
              />
            </div>

            <div className="col-span-1">
              <label
                htmlFor="addr-lng"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Longitude
              </label>
              <Input
                id="addr-lng"
                type="number"
                step="any"
                placeholder="e.g. 77.1887"
                value={
                  form.longitude !== null && form.longitude !== undefined
                    ? form.longitude
                    : ""
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    longitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="text-xs font-mono"
              />
            </div>

            <div className="col-span-1">
              <label
                htmlFor="addr-placeId"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Google Place ID
              </label>
              <Input
                id="addr-placeId"
                type="text"
                placeholder="ChIJ..."
                value={form.googlePlaceId || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    googlePlaceId: e.target.value,
                  }))
                }
                className="text-xs font-mono"
              />
            </div>

            <div className="col-span-1">
              <label
                htmlFor="addr-mapUrl"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Google Maps URL
              </label>
              <Input
                id="addr-mapUrl"
                type="url"
                placeholder="https://maps.google.com/?q=..."
                value={form.mapUrl || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, mapUrl: e.target.value }))
                }
                className="text-xs"
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
