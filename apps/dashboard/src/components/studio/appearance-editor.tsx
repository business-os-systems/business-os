"use client";

import React from "react";
import { Badge, Button } from "@suite/ui";
import type { AppearanceTokens } from "@suite/website-builder/appearance";
import type { CmsAppearanceThemeDto } from "@/lib/api/site-client";
import { AppearanceForm, type AppearanceDraftUpdate } from "./appearance-form";
import { AppearancePreview } from "./appearance-preview";
import { AppearanceThemeGallery } from "./appearance-theme-gallery";
import { useAppearanceActions } from "./use-appearance-actions";
import { useAppearanceData } from "./use-appearance-data";

export interface AppearanceEditorProps {
  readonly siteId: string;
  readonly permissions: readonly string[];
}

type AppearancePublishState = "unpublished" | "published";

const APPEARANCE_STATUS_BY_STATE = {
  unpublished: { variant: "secondary" as const, label: "Unpublished changes" },
  published: { variant: "tertiary" as const, label: "Published" },
} as const satisfies Record<
  AppearancePublishState,
  { readonly variant: "secondary" | "tertiary"; readonly label: string }
>;

const PUBLISH_BUTTON_LABEL = {
  saving: "Publishing...",
  ready: "Publish appearance",
} as const;

function AppearanceState(props: { readonly children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Appearance"
      className="flex min-h-0 flex-1 items-center justify-center bg-background p-6 text-center text-xs font-medium text-text-muted"
    >
      {props.children}
    </div>
  );
}

function AppearanceError(props: { readonly message: string }) {
  return (
    <p
      role="alert"
      className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs font-medium text-danger"
    >
      {props.message}
    </p>
  );
}

interface AppearanceToolbarProps {
  readonly version: number;
  readonly hasUnpublishedChanges: boolean;
  readonly isSaving: boolean;
  readonly onReset: () => void;
  readonly onPublish: () => void;
}

function AppearanceToolbar(props: AppearanceToolbarProps) {
  const status =
    APPEARANCE_STATUS_BY_STATE[props.hasUnpublishedChanges ? "unpublished" : "published"];
  const publishLabel = props.isSaving
    ? PUBLISH_BUTTON_LABEL.saving
    : PUBLISH_BUTTON_LABEL.ready;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-text">Appearance</h2>
        <Badge variant={status.variant} className="text-[10px]">
          {status.label}
        </Badge>
        <span className="font-mono text-[10px] text-text-muted">{"v" + props.version}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.isSaving}
          onClick={props.onReset}
          className="h-8 text-xs"
        >
          Reset to theme
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={props.isSaving || !props.hasUnpublishedChanges}
          onClick={props.onPublish}
          className="h-8 text-xs"
        >
          {publishLabel}
        </Button>
      </div>
    </div>
  );
}

interface AppearanceBodyProps {
  readonly appearance: {
    readonly version: number;
    readonly hasUnpublishedChanges: boolean;
    readonly sourceItemId: string | null;
    readonly brandName: string;
    readonly brandLogoUrl: string | null;
    readonly draftTokens: AppearanceTokens;
  };
  readonly themes: readonly CmsAppearanceThemeDto[];
  readonly error: string | null;
  readonly isSaving: boolean;
  readonly permissions: readonly string[];
  readonly onSave: (update: AppearanceDraftUpdate) => Promise<void>;
  readonly onSelectTheme: (themeId: string) => Promise<void>;
  readonly onReset: () => void;
  readonly onPublish: () => void;
}

function AppearanceBody(props: AppearanceBodyProps) {
  return (
    <>
      <AppearanceToolbar
        version={props.appearance.version}
        hasUnpublishedChanges={props.appearance.hasUnpublishedChanges}
        isSaving={props.isSaving}
        onReset={props.onReset}
        onPublish={props.onPublish}
      />
      {props.error === null ? null : <AppearanceError message={props.error} />}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <AppearanceThemeGallery
            themes={props.themes}
            selectedThemeId={props.appearance.sourceItemId}
            isSaving={props.isSaving}
            onSelect={props.onSelectTheme}
          />
          <AppearanceForm
            brandName={props.appearance.brandName}
            brandLogoUrl={props.appearance.brandLogoUrl}
            tokens={props.appearance.draftTokens}
            permissions={props.permissions}
            isSaving={props.isSaving}
            onSubmit={props.onSave}
          />
        </div>
        <AppearancePreview
          tokens={props.appearance.draftTokens}
          brandName={props.appearance.brandName}
          brandLogoUrl={props.appearance.brandLogoUrl}
        />
      </div>
    </>
  );
}

/**
 * Appearance editing inside the studio (FR-151, T152): the same theme, brand
 * and preview surface renders in the studio body under the one top bar, so a
 * tenant never leaves the page context to restyle its site.
 */
export function AppearanceEditor({ siteId, permissions }: AppearanceEditorProps) {
  const { data, setAppearance, setError, reload } = useAppearanceData(siteId);
  const actions = useAppearanceActions({ siteId, setAppearance, setError });

  if (data.isLoading) {
    return <AppearanceState>Loading appearance...</AppearanceState>;
  }

  if (data.error !== null && data.appearance === null) {
    return (
      <AppearanceState>
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="max-w-lg text-sm font-medium text-danger">
            {data.error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      </AppearanceState>
    );
  }

  if (data.appearance === null) {
    return <AppearanceState>This site&apos;s appearance is unavailable.</AppearanceState>;
  }

  const appearance = data.appearance;
  return (
    <section
      role="region"
      aria-label="Appearance"
      className="flex min-h-0 flex-1 flex-col bg-background text-text"
    >
      <AppearanceBody
        appearance={appearance}
        themes={data.themes}
        error={data.error}
        isSaving={actions.isSaving}
        permissions={permissions}
        onSave={(update) => actions.save(appearance.version, update)}
        onSelectTheme={(themeId) => actions.selectTheme(appearance.version, themeId)}
        onReset={() => void actions.reset(appearance.version)}
        onPublish={() => void actions.publish(appearance.version)}
      />
    </section>
  );
}
