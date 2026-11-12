import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { CONTROL_SESSION_COOKIE_NAME } from "@suite/auth/platform";
import { readRequiredJourneyEnv } from "./journey-environment";
import {
  isRecord,
  readEnvelopeData,
  readJson,
  readNumber,
  readString,
  requireOk,
} from "./api-envelope";

/**
 * Operator catalog publishing for the journey (#379).
 *
 * The operator half of the journey runs through the real Platform catalog API:
 * create a draft section, preview the exact definition, publish the previewed
 * version, and read it back as the tenant. No step is stubbed; a broken create,
 * preview or publish path fails the journey here before a browser opens.
 */

const CATALOG_CONTRACT_VERSION = "2026-03";
const CATALOG_ITEMS_PATH = "/api/v1/admin/apps/website-builder/items";

export interface JourneySection {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly headline: string;
  readonly version: number;
}

export interface PublishedTemplate {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface PublishTemplateOptions {
  readonly api: APIRequestContext;
  readonly operatorSessionToken: string;
  readonly suffix: string;
  readonly headline: string;
}

export interface PublishSectionOptions {
  readonly api: APIRequestContext;
  readonly operatorSessionToken: string;
  readonly suffix: string;
  readonly headline: string;
}

function newIdempotencyKey(action: string): string {
  return "journey-" + action + "-" + randomUUID();
}

function operatorHeaders(operatorSessionToken: string): Record<string, string> {
  return {
    accept: "application/json",
    cookie: CONTROL_SESSION_COOKIE_NAME + "=" + operatorSessionToken,
    origin: readRequiredJourneyEnv("CONTROL_PLANE_ORIGIN"),
    "content-type": "application/json",
  };
}

function buildTemplateBody(options: PublishTemplateOptions): Record<string, unknown> {
  return {
    kind: "TEMPLATE",
    name: "Journey Template " + options.suffix,
    slug: "journey-template-" + options.suffix,
    category: "marketing",
    industries: [],
    definition: {
      schemaVersion: CATALOG_CONTRACT_VERSION,
      pages: [
        {
          version: 1,
          schemaVersion: CATALOG_CONTRACT_VERSION,
          meta: { title: "Journey Home " + options.suffix },
          sections: [
            {
              id: "sec_journey_template_" + options.suffix,
              name: "Hero",
              blocks: [
                {
                  id: "blk_journey_template_" + options.suffix,
                  type: "hero",
                  props: {
                    badge: "Journey proof",
                    headline: options.headline,
                    subheadline: "A template the operator published and the tenant copied.",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function buildSectionBody(options: PublishSectionOptions): Record<string, unknown> {
  return {
    kind: "SECTION",
    name: "Journey Section " + options.suffix,
    slug: "journey-section-" + options.suffix,
    category: "marketing",
    industries: [],
    definition: {
      schemaVersion: CATALOG_CONTRACT_VERSION,
      block: {
        id: "blk_journey_" + options.suffix,
        type: "hero",
        props: {
          badge: "Journey proof",
          headline: options.headline,
          subheadline: "This section was published by the operator and inserted by the tenant.",
        },
      },
    },
  };
}

/**
 * Creates, previews and publishes one catalog item. Publishing requires a
 * preview of the same definition hash by contract, so the three calls are one
 * unit and every mutation carries its own idempotency key.
 */
async function publishCatalogItem(input: {
  readonly api: APIRequestContext;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
  readonly label: string;
}): Promise<Record<string, unknown>> {
  const created = await input.api.post(CATALOG_ITEMS_PATH, {
    headers: { ...input.headers, "idempotency-key": newIdempotencyKey("create") },
    data: input.body,
  });
  await requireOk(created, "Creating the catalog " + input.label);
  const createdData = readEnvelopeData(await readJson(created));
  const itemId = readString(createdData, "id");
  const draftVersion = readNumber(createdData, "draftVersion");

  const previewed = await input.api.post(CATALOG_ITEMS_PATH + "/" + itemId + "/preview", {
    headers: { ...input.headers, "idempotency-key": newIdempotencyKey("preview") },
  });
  await requireOk(previewed, "Previewing the catalog " + input.label);

  const published = await input.api.post(CATALOG_ITEMS_PATH + "/" + itemId + "/publish", {
    headers: { ...input.headers, "idempotency-key": newIdempotencyKey("publish") },
    data: { version: draftVersion, changeNote: "Journey publish" },
  });
  await requireOk(published, "Publishing the catalog " + input.label);
  const publishedData = readEnvelopeData(await readJson(published));
  if (readString(publishedData, "status") !== "ACTIVE") {
    throw new Error("The published catalog " + input.label + " is not ACTIVE.");
  }
  return publishedData;
}

/** Publishes the template the tenant copies its first site from. */
export async function publishJourneyTemplate(
  options: PublishTemplateOptions
): Promise<PublishedTemplate> {
  const published = await publishCatalogItem({
    api: options.api,
    headers: operatorHeaders(options.operatorSessionToken),
    body: buildTemplateBody(options),
    label: "template",
  });
  return {
    id: readString(published, "id"),
    name: readString(published, "name"),
    slug: readString(published, "slug"),
  };
}

/** Publishes the section the tenant inserts into its first page. */
export async function publishJourneySection(
  options: PublishSectionOptions
): Promise<JourneySection> {
  const published = await publishCatalogItem({
    api: options.api,
    headers: operatorHeaders(options.operatorSessionToken),
    body: buildSectionBody(options),
    label: "section",
  });
  return {
    id: readString(published, "id"),
    slug: readString(published, "slug"),
    name: readString(published, "name"),
    headline: options.headline,
    version: readNumber(published, "currentVersion"),
  };
}

/** The tenant-visible section list, read through the real CMS endpoint. */
export async function readTenantSections(
  api: APIRequestContext
): Promise<readonly Record<string, unknown>[]> {
  const response = await api.get("/api/v1/cms/catalog/sections", {
    headers: { accept: "application/json" },
  });
  await requireOk(response, "Reading the tenant section catalog");
  const data = readEnvelopeData(await readJson(response));
  const items = data.items;
  if (!Array.isArray(items)) {
    throw new Error("The tenant section catalog has no items array.");
  }
  return items.filter(isRecord);
}