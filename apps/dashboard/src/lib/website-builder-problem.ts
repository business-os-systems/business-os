import { NextResponse } from "next/server";
import {
  hasPermission,
  PERMISSIONS,
  PLATFORM_ERROR_CODE,
  PLATFORM_ERROR_CODES,
} from "@suite/core";
import { AppError } from "@suite/core/errors";
import type { WebsiteBuilderDenialReason } from "@/components/layout/website-builder-nav.config";
import { problemResponse } from "@/lib/problem-response";

/** Maps a failed Website Builder access evaluation to its RFC 7807 response. */
export function websiteBuilderAccessProblem(
  reason: WebsiteBuilderDenialReason,
  instance: string
): NextResponse {
  const PRESENTATION = {
    app_not_installed: {
      status: PLATFORM_ERROR_CODES.APP_NOT_INSTALLED.status,
      code: PLATFORM_ERROR_CODE.APP_NOT_INSTALLED,
      title: PLATFORM_ERROR_CODES.APP_NOT_INSTALLED.title,
      detail: "The Website Builder application is not installed for this workspace.",
    },
    capability_denied: {
      status: PLATFORM_ERROR_CODES.CAPABILITY_DENIED.status,
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      title: PLATFORM_ERROR_CODES.CAPABILITY_DENIED.title,
      detail: "Your role does not include the capability required for this Website Builder action.",
    },
    entitlements_unavailable: {
      status: PLATFORM_ERROR_CODES.DEPENDENCY_UNAVAILABLE.status,
      code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      title: PLATFORM_ERROR_CODES.DEPENDENCY_UNAVAILABLE.title,
      detail: "Website Builder entitlements could not be verified.",
    },
  } as const satisfies Record<
    WebsiteBuilderDenialReason,
    { status: number; code: string; title: string; detail: string }
  >;
  return problemResponse({ ...PRESENTATION[reason], instance });
}

/**
 * Presents a typed AppError verbatim (detail, invalidParams, code) and reserves
 * the generic internal problem for genuinely unexpected failures.
 */
export function problemFromError(error: unknown, instance: string): NextResponse {
  if (error instanceof AppError) {
    return problemResponse({
      status: error.status,
      code: error.code,
      title: error.title,
      detail: error.detail,
      instance,
      ...(error.invalidParams === undefined ? {} : { invalidParams: [...error.invalidParams] }),
    });
  }
  console.error("Unexpected API failure:", error instanceof Error ? error.message : String(error));
  return problemResponse({
    status: PLATFORM_ERROR_CODES.INTERNAL_ERROR.status,
    code: PLATFORM_ERROR_CODE.INTERNAL_ERROR,
    title: PLATFORM_ERROR_CODES.INTERNAL_ERROR.title,
    detail: "An unexpected error occurred while processing the request.",
    instance,
  });
}

export function canRevealInquiryPii(permissions: readonly string[] | undefined): boolean {
  return hasPermission(permissions ?? [], PERMISSIONS.WEBSITE_BUILDER.LEADS_PII);
}
