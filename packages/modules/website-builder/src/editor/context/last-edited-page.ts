/**
 * Per-user editor context for the site switcher and the studio entry route
 * (FR-079, FR-084).
 *
 * The context is intentionally client-side: it records which page a person was
 * editing, not what the site contains, so it needs no tenant table and no
 * migration. The storage is injected so every caller and test uses the same
 * browser contract, and a stored value is never trusted as a page address.
 */

export interface EditorContextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EditorContextScope {
  readonly organizationId: string;
  readonly userId: string;
  readonly siteId: string;
}

const STORAGE_KEY_PREFIX = "website-builder:last-page";
/** Page identifiers are cuid/ULID-shaped; anything else is discarded. */
const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function lastEditedPageStorageKey(scope: EditorContextScope): string {
  return [STORAGE_KEY_PREFIX, scope.organizationId, scope.userId, scope.siteId].join(":");
}

/** Returns the recorded page id, or null for missing, malformed or stale data. */
export function readLastEditedPage(
  scope: EditorContextScope,
  storage: EditorContextStorage
): string | null {
  const raw = storage.getItem(lastEditedPageStorageKey(scope));
  if (raw === null || !PAGE_ID_PATTERN.test(raw)) {
    return null;
  }
  return raw;
}

export function recordLastEditedPage(
  scope: EditorContextScope,
  pageId: string,
  storage: EditorContextStorage
): void {
  if (!PAGE_ID_PATTERN.test(pageId)) {
    return;
  }
  storage.setItem(lastEditedPageStorageKey(scope), pageId);
}

export function forgetLastEditedPage(
  scope: EditorContextScope,
  storage: EditorContextStorage
): void {
  storage.removeItem(lastEditedPageStorageKey(scope));
}
