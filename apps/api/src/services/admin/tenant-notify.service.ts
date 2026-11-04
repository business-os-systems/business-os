import { Prisma, type PrismaClient } from "@suite/db";
import { sendEmail } from "@suite/auth";
import { logger } from "@suite/logger";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ServiceUnavailableError } from "@suite/core/errors";
import {
  readPlatformSqlMessage,
  readPlatformSqlState,
} from "./platform-sql-errors.js";

interface AdminContactRow {
  email: string;
}

export interface TenantAdminContactRequest {
  readonly organizationId: string;
  /** The operator whose lifecycle change caused the notification. */
  readonly actorId: string;
  readonly requestId: string;
}

export interface TenantRestoreNotificationRequest
  extends TenantAdminContactRequest {
  readonly organizationName: string;
}

export interface TenantNotificationOutcome {
  readonly delivered: number;
  readonly failed: number;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The organisation name is tenant-controlled. It is escaped before it enters
 * the HTML part, otherwise a tenant could shape markup or links in mail sent
 * from the platform's trusted sender.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? "");
}

/**
 * Administrators are derived from capabilities, never from a role title. The
 * database writes its audit row before returning an address, so a notification
 * is always attributable to the operator whose change triggered it (FR-013).
 */
export async function listTenantAdminContacts(
  prisma: PrismaClient,
  request: TenantAdminContactRequest
): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<AdminContactRow[]>(
      Prisma.sql`SELECT * FROM platform.fn_tenant_admin_contacts(
        ${request.organizationId},
        ${request.actorId},
        ${request.requestId}
      )`
    );
    return rows.map((row) => row.email);
  } catch (error) {
    // The worker needs a retryable failure; the SQL detail belongs in the log,
    // not in the outbox row an operator later reads.
    logger.error(
      {
        organizationId: request.organizationId,
        sqlState: readPlatformSqlState(error),
        detail: readPlatformSqlMessage(error).trim(),
      },
      "Tenant administrator contact read failed"
    );
    throw new ServiceUnavailableError(
      "Unable to address the tenant's administrators.",
      { code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE, cause: error }
    );
  }
}

function restoreEmailBody(organizationName: string): {
  html: string;
  text: string;
} {
  const safeName = escapeHtml(organizationName);
  const text = [
    `Access to ${organizationName} on Business OS has been restored.`,
    "",
    "You can sign in again with your usual credentials. No data was removed while the workspace was suspended.",
    "",
    "If you did not expect this change, contact platform support.",
  ].join("\n");

  const html = [
    `<p>Access to <strong>${safeName}</strong> on Business OS has been restored.</p>`,
    "<p>You can sign in again with your usual credentials. No data was removed while the workspace was suspended.</p>",
    "<p>If you did not expect this change, contact platform support.</p>",
  ].join("");

  return { html, text };
}

async function deliverToRecipient(
  request: TenantRestoreNotificationRequest,
  email: string
): Promise<boolean> {
  const body = restoreEmailBody(request.organizationName);
  const result = await sendEmail({
    to: email,
    subject: `Your Business OS workspace ${request.organizationName} has been restored`,
    html: body.html,
    text: body.text,
    organizationId: request.organizationId,
  });

  if (!result.success) {
    logger.warn(
      { organizationId: request.organizationId, error: result.error },
      "Tenant restore notification failed for one administrator"
    );
  }
  return result.success;
}

/**
 * Notifies the tenant's administrators that access has returned (FR-018).
 *
 * The outbox is at-least-once, so a retry re-sends to everyone; that is the
 * accepted cost of never leaving an administrator uninformed when one delivery
 * fails. Per-recipient delivery keys are the correct long-term fix and are
 * tracked as a follow-up.
 */
export async function notifyTenantRestored(
  prisma: PrismaClient,
  request: TenantRestoreNotificationRequest
): Promise<TenantNotificationOutcome> {
  const contacts = await listTenantAdminContacts(prisma, request);
  let delivered = 0;
  let failed = 0;

  for (const email of contacts) {
    if (await deliverToRecipient(request, email)) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  if (failed > 0) {
    throw new ServiceUnavailableError(
      `Restore notification failed for ${failed} of ${contacts.length} tenant administrators.`,
      { code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE }
    );
  }

  return { delivered, failed };
}
