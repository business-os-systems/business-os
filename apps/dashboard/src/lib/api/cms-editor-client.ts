import { z } from "zod";
import {
  BlockAstSchema,
  MediaAssetMapSchema,
  PageAstSchema,
} from "@suite/website-builder/ast";
import type {
  CatalogSection,
  DraftContentTransport,
  PageContentSnapshot,
} from "@suite/website-builder/editor";
import { CmsApiError, cmsRequest, readCmsProblem } from "./site-client";

const CMS_BASE = "/api/v1/cms";
const CATALOG_SECTION_LIMIT = 100;

const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data, requestId: z.string(), timestamp: z.string() });

export const pageContentSchema = z
  .object({
    pageId: z.string(),
    revision: z.number().int().positive(),
    draftAst: PageAstSchema,
    publishedAst: PageAstSchema.nullable(),
    media: MediaAssetMapSchema,
    updatedAt: z.string(),
    lastEditedByUserId: z.string().nullable(),
    lastEditedAt: z.string().nullable(),
  })
  .strict();

const pageContentResultSchema = envelopeSchema(z.object({ content: pageContentSchema }).strict());

const catalogSectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    category: z.string(),
    industries: z.array(z.string()),
    currentVersion: z.number().int().positive(),
    previewRef: z.string().nullable(),
    definition: z.object({ schemaVersion: z.string(), block: BlockAstSchema }).strict(),
  })
  .strict();

const catalogSectionsResultSchema = envelopeSchema(
  z.object({ items: z.array(catalogSectionSchema) }).strict()
);

function contentPath(pageId: string): string {
  return CMS_BASE + "/pages/" + encodeURIComponent(pageId) + "/content";
}

export async function getPageContent(pageId: string): Promise<PageContentSnapshot> {
  const response = await cmsRequest(contentPath(pageId), pageContentResultSchema, { method: "GET" });
  return response.data.content;
}

export async function listCatalogSections(): Promise<CatalogSection[]> {
  const path = CMS_BASE + "/catalog/sections?limit=" + String(CATALOG_SECTION_LIMIT);
  const response = await cmsRequest(path, catalogSectionsResultSchema, { method: "GET" });
  return response.data.items;
}

async function readSavedContent(response: Response): Promise<PageContentSnapshot> {
  const payload: unknown = await response.json();
  const parsed = pageContentResultSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[cms-editor-client] Unexpected save response shape", parsed.error.issues);
    throw new Error("The server returned a draft save response this studio does not understand.");
  }
  return parsed.data.data.content;
}

/**
 * HTTP transport for the autosave controller. A 409 is mapped to the conflict
 * result, never to a silent overwrite: the caller must choose a resolution.
 */
export function createDraftTransport(pageId: string): DraftContentTransport {
  return {
    async saveDraft(input) {
      const response = await fetch(contentPath(pageId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 409) {
        const current = await getPageContent(pageId);
        return { kind: "conflict", current, retainedInHistory: true };
      }
      if (!response.ok) {
        throw new CmsApiError(response.status, await readCmsProblem(response));
      }
      return { kind: "saved", snapshot: await readSavedContent(response) };
    },
  };
}
