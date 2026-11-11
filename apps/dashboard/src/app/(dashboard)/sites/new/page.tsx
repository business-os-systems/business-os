import React from "react";
import { getHostModelConfig } from "@suite/core";
import { CreateSiteWizardLoader } from "@/components/sites/create-site-wizard";

export default function NewSitePage() {
  return (
    <CreateSiteWizardLoader domainRoot={getHostModelConfig().tenantRootDomain ?? ""} />
  );
}
