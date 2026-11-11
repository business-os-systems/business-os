import {
  toInquiryDetail,
  toInquirySummary,
  type InquiryDetail,
  type InquiryListPage,
  type InquirySummary,
} from "./dto.js";
import { extractContactFields, type InquiryStatus } from "./policy.js";
import {
  countUnreadInquiries,
  eraseInquiry,
  getInquiry,
  listInquiries,
  readInquiryWithPiiAudit,
  updateInquiryStatus,
  type InquiryRecord,
} from "./store.js";

/**
 * Tenant-facing inquiry orchestration shared by the API and the dashboard.
 * Identity is always the verified session; personal data is returned only
 * through the audited reveal path (FR-047, FR-048).
 */

export interface InquiryListInput {
  readonly organizationId: string;
  readonly siteId?: string;
  readonly status?: InquiryStatus;
  readonly cursor?: string;
  readonly limit: number;
}

export async function listTenantInquiries(input: InquiryListInput): Promise<InquiryListPage> {
  const page = await listInquiries(input);
  return { items: page.items.map(toInquirySummary), nextCursor: page.nextCursor };
}

function detailFor(record: InquiryRecord, revealPii: boolean): InquiryDetail {
  return toInquiryDetail(record, revealPii ? extractContactFields(record.payload) : null);
}

/**
 * Reads one inquiry. A PII reveal writes its audit row before the contact
 * values leave the service, so an unaudited read is impossible (FR-048).
 */
export async function getTenantInquiry(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly revealPii: boolean;
  readonly actorUserId: string;
}): Promise<InquiryDetail | null> {
  if (input.revealPii) {
    const record = await readInquiryWithPiiAudit(input);
    return record === null ? null : detailFor(record, true);
  }
  const record = await getInquiry(input);
  return record === null ? null : detailFor(record, false);
}

export async function changeTenantInquiryStatus(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly status: InquiryStatus;
  readonly actorUserId: string;
}): Promise<InquirySummary | null> {
  const record = await updateInquiryStatus(input);
  return record === null ? null : toInquirySummary(record);
}

export async function eraseTenantInquiry(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly actorUserId: string;
}): Promise<boolean> {
  return eraseInquiry(input);
}

export function countTenantUnreadInquiries(organizationId: string): Promise<number> {
  return countUnreadInquiries(organizationId);
}
