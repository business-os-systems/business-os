"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/config-renderers/config-form-renderer";
import {
  createGeneralSettingsFormConfig,
  generalSettingsValidationSchema,
  type GeneralSettingsFormValues,
} from "./general.config";

export interface GeneralSettingsClientProps {
  initialData: GeneralSettingsFormValues;
  organizationId: string;
  slug: string;
  userPermissions?: readonly string[];
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
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const formConfig = useMemo(() => createGeneralSettingsFormConfig(slug), [slug]);

  const handleSubmit = async (values: GeneralSettingsFormValues) => {
    setIsSaving(true);
    setServerErrors({});
    setNotification(null);

    try {
      const res = await fetch("/api/v1/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          customDomain: values.customDomain || null,
          currency: values.currency,
          country: values.country,
          defaultLocale: values.defaultLocale,
          jurisdiction: values.jurisdiction,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.code === "DOMAIN_ALREADY_EXISTS") {
          setServerErrors({
            customDomain: errorData.detail || "Domain is already in use by another organization.",
          });
        } else if (errorData.invalidParams) {
          const fieldMap: Record<string, string> = {};
          for (const param of errorData.invalidParams) {
            fieldMap[param.name] = param.reason;
          }
          setServerErrors(fieldMap);
        } else {
          setNotification({
            type: "error",
            message: errorData.detail || "Failed to update organization settings.",
          });
        }
        return;
      }

      const updated = await res.json();
      setFormData({
        name: updated.name,
        customDomain: updated.customDomain ?? "",
        currency: updated.currency,
        country: updated.country,
        defaultLocale: updated.defaultLocale,
        jurisdiction: updated.jurisdiction,
      });

      setNotification({
        type: "success",
        message: "Organization settings successfully updated.",
      });

      // Refresh server components across header and layout
      router.refresh();
    } catch (error) {
      console.error("[GeneralSettingsClient] Submission network error:", error);
      setNotification({
        type: "error",
        message: "Network error occurred while updating settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDangerAction = async (sectionId: string) => {
    if (sectionId !== "danger-archive") return;

    setIsSaving(true);
    setNotification(null);
    try {
      const res = await fetch("/api/v1/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ARCHIVED",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setNotification({
          type: "error",
          message: err.detail || "Failed to archive organization.",
        });
        setIsSaving(false);
        return;
      }

      setNotification({
        type: "success",
        message: "Organization has been archived.",
      });

      // Redirect after archiving
      router.push("/login");
    } catch (error) {
      console.error("[GeneralSettingsClient] Archival network error:", error);
      setNotification({
        type: "error",
        message: "Network error occurred while archiving organization.",
      });
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {notification && (
        <Alert
          isToast
          variant={notification.type === "success" ? "success" : "error"}
          message={notification.message}
          dismissible
          autoDismissMs={5000}
          onDismiss={() => setNotification(null)}
        />
      )}

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
