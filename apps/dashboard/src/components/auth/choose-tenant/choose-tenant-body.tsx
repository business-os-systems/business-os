"use client";

import React from "react";
import { ChooseTenantError } from "./choose-tenant-error";
import { ChooseTenantList } from "./choose-tenant-list";
import type { ChooseTenantController } from "./use-choose-tenant";

export interface ChooseTenantBodyProps {
  controller: ChooseTenantController;
}

/** Chooser body: an optional error banner above the workspace list. */
export function ChooseTenantBody({ controller }: ChooseTenantBodyProps) {
  const errorMessage = controller.errorMessage;

  return (
    <>
      {errorMessage !== null && (
        <ChooseTenantError message={errorMessage} onRetry={controller.reload} />
      )}
      <ChooseTenantList controller={controller} />
    </>
  );
}
