import React from "react";
import { Alert } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { readWebsiteBuilderConfiguration } from "@/services/website-builder-settings.service";
import { WebsiteBuilderSettingsPanel } from "./settings-panel";

/**
 * Configuration is its own destination (FR-158, FR-159, FR-161). Operational
 * data such as sites and inquiries is never rendered here.
 */
export default async function WebsiteSettingsPage() {
  const session = await requireAuth();
  const access = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }

  const configuration = await readWebsiteBuilderConfiguration();
  if (configuration.kind === "not_installed") {
    return <AccessDenied reason="app_not_installed" />;
  }
  if (configuration.kind === "unavailable") {
    return (
      <Alert
        variant="error"
        title="Settings unavailable"
        message={configuration.message}
      />
    );
  }
  return <WebsiteBuilderSettingsPanel fields={configuration.fields} />;
}
