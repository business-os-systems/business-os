/**
 * Published-only host resolution through the storefront read contract (T053).
 *
 * The storefront app never reads the database directly; it consumes the
 * declared resolve endpoint and fails closed to a neutral holding state when
 * the API is unreachable, returns an unexpected shape or answers with an
 * unrecognised status (FR-039, FR-110, FR-143).
 */

import { z } from "zod";
import { getStorefrontApiUrl } from "@/lib/env";
import type { PublicSite } from "@/lib/storefront/pages";

const STOREFRONT_RESOLVE_PATH = "/api/v1/storefront/resolve";
const RESOLVE_TIMEOUT_MS = 3000;

const resolveResponseSchema = z.object({
  siteId: z.string().min(1),
  orgId: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  homePath: z.string().startsWith("/"),
  defaultLocale: z.string().min(1),
});

export type StorefrontResolution =
  | { readonly kind: "published"; readonly site: PublicSite }
  | { readonly kind: "unavailable" }
  | { readonly kind: "gone" }
  | { readonly kind: "upstream_error" };

const PUBLISHED_STATUS = "PUBLISHED";
const GONE_STATUSES = ["SUSPENDED", "ARCHIVED"] as const;

function toPublicSite(input: z.infer<typeof resolveResponseSchema>): PublicSite {
  return {
    title: input.title,
    homePath: input.homePath,
    defaultLocale: input.defaultLocale,
    homePage: null,
  };
}

function classifyStatus(input: z.infer<typeof resolveResponseSchema>): StorefrontResolution {
  if (input.status === PUBLISHED_STATUS) {
    return { kind: "published", site: toPublicSite(input) };
  }
  if ((GONE_STATUSES as readonly string[]).includes(input.status)) {
    return { kind: "gone" };
  }
  return { kind: "unavailable" };
}

function statusToResolution(status: number): StorefrontResolution | null {
  if (status === 404) {
    return { kind: "unavailable" };
  }
  if (status === 410) {
    return { kind: "gone" };
  }
  return null;
}

export async function resolveStorefrontSite(hostname: string): Promise<StorefrontResolution> {
  try {
    const url = new URL(STOREFRONT_RESOLVE_PATH, getStorefrontApiUrl());
    url.searchParams.set("host", hostname);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });

    const statusResolution = statusToResolution(response.status);
    if (statusResolution !== null) {
      return statusResolution;
    }
    if (!response.ok) {
      return { kind: "upstream_error" };
    }

    const parsed = resolveResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { kind: "upstream_error" };
    }
    return classifyStatus(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Storefront host resolution failed:", message);
    return { kind: "upstream_error" };
  }
}
