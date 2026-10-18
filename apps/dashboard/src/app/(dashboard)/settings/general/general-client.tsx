"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@suite/ui";
import { httpClient } from "@/lib/http-client";
import { ConfigFormRenderer } from "@/components/config-renderers/config-form-renderer";
import {
  createGeneralSettingsFormConfig,
  generalSettingsValidationSchema,
  type GeneralSettingsFormValues,
} from "./general.config";
import { isBrowser } from "@/lib/env";

export interface GeneralSettingsClientProps {
  initialData: GeneralSettingsFormValues;
  organizationId: string;
  slug: string;
  userPermissions?: readonly string[];
}

interface OrganizationApiResponse {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  currency: string;
  country: string;
  defaultLocale: string;
  jurisdiction: string;
  code?: string;
  detail?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export function GeneralSettingsClient({
  initialData,
  slug,
  userPermissions = [],
}: GeneralSettingsClientProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<GeneralSettingsFormValues>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const formConfig = useMemo(() => createGeneralSettingsFormConfig(slug), [slug]);

  const handleSubmit = async (values: GeneralSettingsFormValues) => {
    setIsSaving(true);
    setServerErrors({});

    try {
      const res = await httpClient.patch<OrganizationApiResponse>(
        "/api/v1/settings/organization",
        {
          name: values.name,
          customDomain: values.customDomain || null,
          currency: values.currency,
          country: values.country,
          defaultLocale: values.defaultLocale,
          jurisdiction: values.jurisdiction,
        }
      );

      if (!res.ok) {
        const errorData = res.data;
        if (errorData.code === "DOMAIN_ALREADY_EXISTS") {
          setServerErrors({
            customDomain: errorData.detail || "Domain is already in use by another organization.",
          });
          toast.error(errorData.detail || "Domain is already in use by another organization.");
        } else if (errorData.invalidParams) {
          const fieldMap: Record<string, string> = {};
          for (const param of errorData.invalidParams) {
            fieldMap[param.name] = param.reason;
          }
          setServerErrors(fieldMap);
          toast.error("Please correct the errors in the form.");
        } else {
          toast.error(errorData.detail || "Failed to update organization settings.");
        }
        return;
      }

      const updated = res.data;
      setFormData({
        name: updated.name,
        customDomain: updated.customDomain ?? "",
        currency: updated.currency,
        country: updated.country,
        defaultLocale: updated.defaultLocale,
        jurisdiction: updated.jurisdiction,
      });

      // Dispatch event for instant header synchronization
      if (isBrowser) {
        window.dispatchEvent(
          new CustomEvent("suite:org-name-updated", {
            detail: { organizationName: updated.name },
          })
        );
      }

      toast.success("Organization settings successfully updated.");
      router.refresh();
    } catch (error) {
      console.error("[GeneralSettingsClient] Submission network error:", error);
      toast.error("Network error occurred while updating settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDangerAction = async (sectionId: string) => {
    if (sectionId !== "danger-archive") return;

    setIsSaving(true);
    try {
      const res = await httpClient.patch<OrganizationApiResponse>(
        "/api/v1/settings/organization",
        {
          status: "ARCHIVED",
        }
      );

      if (!res.ok) {
        const err = res.data;
        toast.error(err.detail || "Failed to archive organization.");
        setIsSaving(false);
        return;
      }

      toast.success("Organization has been archived.");
      if (isBrowser) {
        window.location.assign("/login?notice=archived");
      }
    } catch (error) {
      console.error("[GeneralSettingsClient] Archival network error:", error);
      toast.error("Network error occurred while archiving organization.");
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConfigFormRenderer<GeneralSettingsFormValues>
        config={formConfig}
        initialValues={formData}
        validationSchema={generalSettingsValidationSchema}
        userPermissions={userPermissions}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onDiscard={() => setFormData(initialData)}
        onDangerAction={handleDangerAction}
        serverErrors={serverErrors}
      />
    </div>
  );
}
