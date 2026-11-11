"use client";

import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@suite/ui";
import {
  publishableVersion,
  type CatalogItem,
} from "@/lib/catalog-api";
import type {
  CatalogPreviewRecordingState,
  CatalogPublishError,
} from "./catalog-preview-state";

interface CatalogPublishCardProps {
  readonly item: CatalogItem;
  readonly recording: CatalogPreviewRecordingState;
  readonly canPublish: boolean;
  readonly isPublishing: boolean;
  readonly changeNote: string;
  readonly publishError: CatalogPublishError | null;
  readonly publishSuccess: string | null;
  readonly onNoteChange: (value: string) => void;
  readonly onPublish: () => void;
  readonly onRePreview: () => void;
}

function RecordedControls({
  version,
  isPublishing,
  changeNote,
  onNoteChange,
  onPublish,
}: {
  readonly version: number;
  readonly isPublishing: boolean;
  readonly changeNote: string;
  readonly onNoteChange: (value: string) => void;
  readonly onPublish: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-success">
        Preview recorded for version v{version}. Publishing this version is enabled.
      </p>
      <div className="space-y-1">
        <Label htmlFor="catalog-publish-note" className="text-xs font-medium text-text">
          Change note (optional)
        </Label>
        <Input
          id="catalog-publish-note"
          value={changeNote}
          maxLength={500}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
      <Button type="button" disabled={isPublishing} onClick={onPublish}>
        {isPublishing ? "Publishing..." : `Publish version v${version}`}
      </Button>
    </div>
  );
}

function PreviewGateError({
  message,
  onRePreview,
}: {
  readonly message: string;
  readonly onRePreview: () => void;
}) {
  return (
    <div className="space-y-2">
      <Alert variant="error" title="Preview could not be recorded" message={message} />
      <Button type="button" variant="secondary" onClick={onRePreview}>
        Preview again
      </Button>
    </div>
  );
}

function PreviewGateStale({
  version,
  previewedVersion,
  onRePreview,
}: {
  readonly version: number;
  readonly previewedVersion: number;
  readonly onRePreview: () => void;
}) {
  return (
    <div className="space-y-2">
      <Alert
        variant="warning"
        title="Stale preview"
        message={`Version v${version} differs from the previewed version v${previewedVersion}. Preview the current draft again.`}
      />
      <Button type="button" variant="secondary" onClick={onRePreview}>
        Preview again
      </Button>
    </div>
  );
}

function PublishGate({
  item,
  recording,
  canPublish,
  isPublishing,
  changeNote,
  onNoteChange,
  onPublish,
  onRePreview,
}: CatalogPublishCardProps) {
  const version = publishableVersion(item);
  if (!canPublish) {
    return (
      <p className="text-xs text-text-secondary">
        Read-only preview. Publishing requires the platform:apps:publish capability.
      </p>
    );
  }
  if (version === null) {
    return <p className="text-xs text-text-secondary">This item has no version to publish.</p>;
  }
  if (item.status === "ACTIVE" && item.draftVersion === null) {
    return (
      <p className="text-xs text-text-secondary">
        Version v{version} is already published. Edit the item to open a new draft.
      </p>
    );
  }
  if (recording.kind === "recording") {
    return <p className="text-xs text-text-secondary" role="status">Recording the completed preview...</p>;
  }
  if (recording.kind === "error") {
    return <PreviewGateError message={recording.message} onRePreview={onRePreview} />;
  }
  if (recording.kind === "idle") {
    return (
      <Alert
        variant="info"
        title="Preview required"
        message="Open the preview to record it before publishing. An author capability is required to record a preview."
      />
    );
  }
  if (recording.version !== version) {
    return (
      <PreviewGateStale version={version} previewedVersion={recording.version} onRePreview={onRePreview} />
    );
  }
  return (
    <RecordedControls
      version={version}
      isPublishing={isPublishing}
      changeNote={changeNote}
      onNoteChange={onNoteChange}
      onPublish={onPublish}
    />
  );
}

/** The only surface that can make a catalog version live (FR-086). */
export function CatalogPublishCard(props: CatalogPublishCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publish</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.publishError === null ? null : (
          <Alert
            variant="error"
            title={props.publishError.previewRequired ? "Preview required" : "Publish refused"}
            message={props.publishError.message}
          />
        )}
        {props.publishSuccess === null ? null : (
          <Alert variant="success" title="Published" message={props.publishSuccess} />
        )}
        <PublishGate {...props} />
      </CardContent>
    </Card>
  );
}
