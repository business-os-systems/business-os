import { z } from "zod";
import { PageAstSchema } from "../../ast/schema.js";
import type { PageAst } from "../../ast/types.js";

export const OFFLINE_DRAFT_KEY_PREFIX = "business-os:website-builder:draft:";

const offlineDraftSchema = z
  .object({
    pageId: z.string().min(1).max(64),
    organizationId: z.string().min(1).max(64),
    baseRevision: z.number().int().positive(),
    savedAt: z.string().datetime(),
    draftAst: PageAstSchema,
  })
  .strict();

export type OfflineDraft = z.infer<typeof offlineDraftSchema>;

export interface OfflineDraftStorage {
  read(pageId: string): OfflineDraft | null;
  write(draft: OfflineDraft): void;
  clear(pageId: string): void;
}

/** The minimal Web Storage surface the editor needs; injected so tests own it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type OfflineDraftRecovery =
  | { readonly kind: "none" }
  | { readonly kind: "recovered"; readonly draft: OfflineDraft }
  | { readonly kind: "discarded"; readonly reason: "malformed" };

function draftKey(organizationId: string, pageId: string): string {
  return OFFLINE_DRAFT_KEY_PREFIX + organizationId + ":" + pageId;
}

interface ParseDraftInput {
  readonly raw: string;
  readonly organizationId: string;
  readonly pageId: string;
}

function parseDraft(input: ParseDraftInput): OfflineDraft | null {
  let payload: unknown;
  try {
    payload = JSON.parse(input.raw);
  } catch (error: unknown) {
    console.error("[website-builder] Ignoring an unreadable offline draft.", error);
    return null;
  }
  const parsed = offlineDraftSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.organizationId !== input.organizationId ||
    parsed.data.pageId !== input.pageId
  ) {
    return null;
  }
  return parsed.data;
}

/**
 * Browser-backed storage for the in-progress draft. The key is tenant-scoped so
 * one workspace can never read another workspace's unsaved work (FR-028).
 */
export function createOfflineDraftStorage(
  storage: KeyValueStorage,
  organizationId: string
): OfflineDraftStorage {
  return {
    read(pageId: string): OfflineDraft | null {
      const raw = storage.getItem(draftKey(organizationId, pageId));
      return raw === null ? null : parseDraft({ raw, organizationId, pageId });
    },
    write(draft: OfflineDraft): void {
      storage.setItem(draftKey(organizationId, draft.pageId), JSON.stringify(draft));
    },
    clear(pageId: string): void {
      storage.removeItem(draftKey(organizationId, pageId));
    },
  };
}

/**
 * Returns the local draft after a reload or reconnect. A draft based on an older
 * revision is still returned: the first save must fail the revision check
 * rather than silently overwrite the newer server content (FR-027).
 */
export function recoverOfflineDraft(
  storage: OfflineDraftStorage,
  pageId: string
): OfflineDraftRecovery {
  const draft = storage.read(pageId);
  return draft === null ? { kind: "none" } : { kind: "recovered", draft };
}

export function buildOfflineDraft(input: {
  readonly organizationId: string;
  readonly pageId: string;
  readonly baseRevision: number;
  readonly savedAt: string;
  readonly draftAst: PageAst;
}): OfflineDraft {
  return offlineDraftSchema.parse({ ...input });
}
