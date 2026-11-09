import React from "react";
import { Alert } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import {
  fetchSupportSessionHistory,
  SupportSessionClientError,
  type SupportSessionHistoryPage,
} from "@/lib/support-session-client";
import { SupportHistory } from "./support-history";
import {
  SUPPORT_HISTORY_COPY,
  SUPPORT_HISTORY_PAGE_SIZE,
} from "./support-history.config";

interface SupportHistoryRead {
  readonly page: SupportSessionHistoryPage | null;
  readonly detail: string | null;
}

/**
 * The API keeps the RFC 7807 detail intact, so the screen shows the real reason
 * (permission or workspace scope). A transport failure is not an RFC 7807
 * problem and its message can name internal infrastructure, so it is logged and
 * replaced with an honest generic line instead of leaking the cause (CWE-209).
 */
function readFailureDetail(error: unknown): string {
  if (error instanceof SupportSessionClientError) {
    return error.message;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("Support-session history read failed:", message);
  return SUPPORT_HISTORY_COPY.transportFailureDetail;
}

async function readSupportHistory(
  cursor: string | undefined
): Promise<SupportHistoryRead> {
  try {
    const page = await fetchSupportSessionHistory({
      ...(cursor === undefined ? {} : { cursor }),
      limit: SUPPORT_HISTORY_PAGE_SIZE,
    });
    return { page, detail: null };
  } catch (error) {
    return { page: null, detail: readFailureDetail(error) };
  }
}

interface SecuritySettingsPageProps {
  readonly searchParams: Promise<
    { readonly cursor?: string | string[] | undefined } | undefined
  >;
}

/** A repeated query parameter is ambiguous, so only one cursor value is honoured. */
function readCursor(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export default async function SecuritySettingsPage({
  searchParams,
}: SecuritySettingsPageProps) {
  await requireAuth();
  const cursor = readCursor((await searchParams)?.cursor);
  const result = await readSupportHistory(cursor);

  return (
    <div className="flex h-full flex-col space-y-4">
      <header className="shrink-0 border-b border-border bg-background pb-3">
        <h1 className="text-xl font-bold tracking-tight text-text">
          {SUPPORT_HISTORY_COPY.pageTitle}
        </h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          {SUPPORT_HISTORY_COPY.pageDescription}
        </p>
      </header>

      {result.page === null ? (
        <Alert
          variant="error"
          title={SUPPORT_HISTORY_COPY.loadErrorTitle}
          message={result.detail}
        />
      ) : (
        <SupportHistory
          items={result.page.items}
          nextCursor={result.page.nextCursor}
          showNewest={cursor !== undefined}
        />
      )}
    </div>
  );
}
