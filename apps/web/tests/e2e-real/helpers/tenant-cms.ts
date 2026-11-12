import type { APIRequestContext } from "@playwright/test";
import { isRecord, readEnvelopeData, readJson, readString, requireOk } from "./api-envelope";

/**
 * Tenant CMS reads used by the journey (#379). Every one goes through the real
 * /api/v1/cms contract with the tenant session; nothing is answered locally.
 */

export interface SiteTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

function readTemplate(record: Record<string, unknown>): SiteTemplate {
  return {
    id: readString(record, "id"),
    name: readString(record, "name"),
    category: readString(record, "category"),
  };
}

export async function readSiteTemplates(api: APIRequestContext): Promise<readonly SiteTemplate[]> {
  const response = await api.get("/api/v1/cms/templates", {
    headers: { accept: "application/json" },
  });
  await requireOk(response, "Reading the published template catalog");
  const data = readEnvelopeData(await readJson(response));
  const items = data.items;
  if (!Array.isArray(items)) {
    throw new Error("The template catalog has no items array.");
  }
  return items.filter(isRecord).map(readTemplate);
}

/** The draft and published ASTs of one page, as the API stores them. */
export async function readPageContent(
  api: APIRequestContext,
  pageId: string
): Promise<Record<string, unknown>> {
  const response = await api.get("/api/v1/cms/pages/" + pageId + "/content", {
    headers: { accept: "application/json" },
  });
  await requireOk(response, "Reading the page content");
  const data = readEnvelopeData(await readJson(response));
  const content = data.content;
  if (!isRecord(content)) {
    throw new Error("The page content response has no content object.");
  }
  return content;
}

/** Whether the draft AST contains the operator's published headline. */
export function draftContainsHeadline(content: Record<string, unknown>, headline: string): boolean {
  return JSON.stringify(content.draftAst).includes(headline);
}
