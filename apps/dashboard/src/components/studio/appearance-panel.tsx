"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import type { AppearanceTokens } from "@suite/website-builder/appearance";
import type { CmsAppearanceThemeDto } from "@/lib/api/site-client";
import { AppearanceForm, type AppearanceDraftUpdate } from "./appearance-form";
import { AppearancePreview } from "./appearance-preview";
import { AppearanceThemeGallery } from "./appearance-theme-gallery";
import { studioHomePath } from "./studio-links.config";
import { useAppearanceActions } from "./use-appearance-actions";
import { useAppearanceData } from "./use-appearance-data";

export interface AppearancePanelProps {
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

function PanelState(props: { readonly children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-center text-xs font-medium text-text-muted">
      {props.children}
    </div>
  );
}

function AppearancePanelHeader(props: {
  readonly siteId: string;
  readonly siteTitle: string;
  readonly siteSlug: string;
  readonly version: number;
  readonly hasUnpublishedChanges: boolean;
  readonly isSaving: boolean;
  readonly onReset: () => void;
  readonly onPublish: () => void;
}) {
  const status =
    APPEARANCE_STATUS_BY_STATE[
      props.hasUnpublishedChanges ? "unpublished" : "published"
    ];
  const publishLabel = props.isSaving
    ? PUBLISH_BUTTON_LABEL.saving
    : PUBLISH_BUTTON_LABEL.ready;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={studioHomePath(props.siteId)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeftIcon size={14} />
          Exit appearance
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="truncate text-xs font-semibold text-text">{props.siteTitle}</span>
        <span className="font-mono text-[11px] text-text-muted">{props.siteSlug}</span>
        <Badge variant={status.variant} className="text-[10px]">
          {status.label}
        </Badge>
        <span className="text-[10px] font-mono text-text-muted">{"v" + props.version}</span>
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
    </header>
  );
}

function PanelError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs font-medium text-danger"
    >
      {message}
    </p>
  );
}

interface AppearancePanelBodyProps {
  readonly siteId: string;
  readonly site: { readonly title: string; readonly slug: string };
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

function AppearancePanelBody(props: AppearancePanelBodyProps) {
  return (
    <div
      data-app="website-builder"
      className="flex h-screen flex-col overflow-hidden bg-background text-text"
    >
      <AppearancePanelHeader
        siteId={props.siteId}
        siteTitle={props.site.title}
        siteSlug={props.site.slug}
        version={props.appearance.version}
        hasUnpublishedChanges={props.appearance.hasUnpublishedChanges}
        isSaving={props.isSaving}
        onReset={props.onReset}
        onPublish={props.onPublish}
      />
      {props.error === null ? null : <PanelError message={props.error} />}
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
    </div>
  );
}

/**
 * The appearance surface: theme gallery, brand basics and a live draft preview
 * (T116). Every mutation is versioned server-side; publishing is the only way
 * a change reaches visitors.
 */
export function AppearancePanel({ siteId, permissions }: AppearancePanelProps) {
  const { data, setAppearance, setError, reload } = useAppearanceData(siteId);
  const actions = useAppearanceActions({ siteId, setAppearance, setError });

  if (data.isLoading) {
    return <PanelState>Loading appearance...</PanelState>;
  }

  if (data.error !== null && data.appearance === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p role="alert" className="max-w-lg text-sm font-medium text-danger">
          {data.error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (data.appearance === null || data.site === null) {
    return <PanelState>This site&apos;s appearance is unavailable.</PanelState>;
  }

  const appearance = data.appearance;
  const site = data.site;

  return (
    <AppearancePanelBody
      siteId={siteId}
      site={site}
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
  );
}
