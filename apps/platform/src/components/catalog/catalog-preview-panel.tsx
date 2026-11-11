"use client";

import { useParams } from "next/navigation";
import { Alert, Button, Spinner } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import {
  appRecordHref,
  isAppRecordId,
} from "@/components/layout/app-record-nav.config";
import { canAuthorApps, canPublishApps, canReadApps } from "@/lib/capability";
import type { CatalogItem } from "@/lib/catalog-api";
import { CATALOG_KIND_SEGMENTS } from "./catalog-list.config";
import { CatalogPreviewView } from "./catalog-preview-view";
import type { CatalogPreviewRecordingState } from "./catalog-preview-state";
import { useCatalogPublish, useCatalogPreview } from "./use-catalog-preview";

function PreviewLoadError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <Alert variant="error" title="Unable to load this catalog item" message={message} />
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function CatalogPreviewPanel() {
  const { appId, itemId } = useParams<{ appId: string; itemId: string }>();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  const allowed = canReadApps(capabilities);
  const validRoute = isAppRecordId(appId) && isAppRecordId(itemId);
  const canRecordPreview = canAuthorApps(capabilities);
  const preview = useCatalogPreview({
    appId,
    itemId,
    enabled: allowed && validRoute,
    canRecordPreview,
  });

  if (!allowed) {
    return <CapabilityDeniedView message="Your operator account cannot read the application catalog." />;
  }
  if (!validRoute) {
    return <Alert variant="error" title="Catalog item not found" message="The item address is not valid." />;
  }
  if (preview.isLoading) {
    return <Spinner />;
  }
  if (preview.error !== null) {
    return <PreviewLoadError message={preview.error} onRetry={() => void preview.reload()} />;
  }
  if (preview.item === null) {
    return <Alert variant="error" title="Catalog item not found" message="The item could not be read." />;
  }
  return (
    <CatalogPreviewBody
      appId={appId}
      item={preview.item}
      recording={preview.recording}
      setItem={preview.setItem}
      setRecording={preview.setRecording}
      canRecordPreview={canRecordPreview}
      canPublish={canPublishApps(capabilities)}
      backHref={appRecordHref(appId, CATALOG_KIND_SEGMENTS[preview.item.kind])}
      onRePreview={() => void preview.recordPreview()}
    />
  );
}

interface CatalogPreviewBodyProps {
  readonly appId: string;
  readonly item: CatalogItem;
  readonly recording: CatalogPreviewRecordingState;
  readonly setItem: (item: CatalogItem) => void;
  readonly setRecording: (state: CatalogPreviewRecordingState) => void;
  readonly canRecordPreview: boolean;
  readonly canPublish: boolean;
  readonly backHref: string;
  readonly onRePreview: () => void;
}

function CatalogPreviewBody({
  appId,
  item,
  recording,
  setItem,
  setRecording,
  canRecordPreview,
  canPublish,
  backHref,
  onRePreview,
}: CatalogPreviewBodyProps) {
  const publish = useCatalogPublish({ appId, item, recording, setItem, setRecording });
  return (
    <div className="space-y-3">
      {canRecordPreview ? null : (
        <Alert
          variant="warning"
          title="Read-only preview"
          message="Recording a preview requires platform:apps:author. Publishing stays unavailable until an author records the preview."
        />
      )}
      <CatalogPreviewView
        item={item}
        recording={recording}
        canPublish={canPublish}
        isPublishing={publish.isPublishing}
        changeNote={publish.changeNote}
        publishError={publish.publishError}
        publishSuccess={publish.publishSuccess}
        backHref={backHref}
        onNoteChange={publish.setChangeNote}
        onPublish={publish.publishVersion}
        onRePreview={onRePreview}
      />
    </div>
  );
}
