"use client";

import { useState } from "react";
import {
  describeCmsError,
  publishSiteAppearance,
  resetSiteAppearance,
  selectAppearanceTheme,
  updateSiteAppearance,
  type CmsAppearanceDto,
} from "@/lib/api/site-client";
import type { AppearanceDraftUpdate } from "./appearance-form";

export interface AppearanceActionsInput {
  readonly siteId: string;
  readonly setAppearance: (appearance: CmsAppearanceDto) => void;
  readonly setError: (error: string | null) => void;
}

export interface AppearanceActions {
  readonly isSaving: boolean;
  readonly save: (version: number, update: AppearanceDraftUpdate) => Promise<void>;
  readonly selectTheme: (version: number, themeId: string) => Promise<void>;
  readonly reset: (version: number) => Promise<void>;
  readonly publish: (version: number) => Promise<void>;
}

/**
 * Runs one appearance mutation at a time, surfaces the RFC 7807 detail and
 * replaces the panel state with the version the server committed (CT-3).
 */
export function useAppearanceActions(input: AppearanceActionsInput): AppearanceActions {
  const [isSaving, setIsSaving] = useState(false);

  async function perform(operation: () => Promise<CmsAppearanceDto>): Promise<void> {
    setIsSaving(true);
    input.setError(null);
    try {
      const appearance = await operation();
      input.setAppearance(appearance);
    } catch (error: unknown) {
      input.setError(describeCmsError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return {
    isSaving,
    save: (version, update) =>
      perform(() =>
        updateSiteAppearance(input.siteId, { expectedVersion: version, ...update })
      ),
    selectTheme: (version, themeId) =>
      perform(() =>
        selectAppearanceTheme(input.siteId, {
          expectedVersion: version,
          catalogItemId: themeId,
        })
      ),
    reset: (version) => perform(() => resetSiteAppearance(input.siteId, version)),
    publish: (version) => perform(() => publishSiteAppearance(input.siteId, version)),
  };
}
