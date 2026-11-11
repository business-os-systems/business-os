import { describe, expect, it } from "vitest";
import {
  buildInquiryCsv,
  buildInquiryExportFilename,
  escapeCsvCell,
} from "../src/inquiries/export.js";
import type { InquiryRecord } from "../src/inquiries/store.js";
import {
  assertInquiryExportWithinCap,
  INQUIRY_EXPORT_MAX_ROWS,
} from "../src/inquiries/policy.js";

function record(overrides: Partial<InquiryRecord> = {}): InquiryRecord {
  return {
    id: "inq_1",
    organizationId: "org_1",
    siteId: "site_1",
    pageId: "page_1",
    blockId: "block_1",
    status: "NEW",
    spamVerdict: null,
    payload: {
      name: 'Jane "JJ" Doe',
      email: "jane.doe@example.org",
      phone: "+1 555 0100",
      message: 'He said "hello", then left.',
    },
    attachments: [],
    emailHash: null,
    submitterHash: null,
    readAt: null,
    archivedAt: null,
    retentionExpiresAt: new Date("2027-11-11T10:00:00.000Z"),
    createdAt: new Date("2026-11-11T10:00:00.000Z"),
    updatedAt: new Date("2026-11-11T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Inquiry CSV export format", () => {
  it("writes a header and one CRLF-terminated row per inquiry", () => {
    const csv = buildInquiryCsv([record()]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,submittedAt,siteId,pageId,blockId,status,name,email,phone,payload"
    );
    expect(lines[1]).toContain('"Jane ""JJ"" Doe"');
    expect(lines[1]).toContain('"jane.doe@example.org"');
    expect(lines[1]).toContain("\"'+1 555 0100\"");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("keeps contact columns empty when the payload has no contact fields", () => {
    const csv = buildInquiryCsv([record({ payload: { message: "No contact details." } })]);
    const row = csv.split("\r\n")[1] ?? "";
    const cells = row.split(",");
    expect(cells[6]).toBe("");
    expect(cells[7]).toBe("");
    expect(cells[8]).toBe("");
  });

  it("neutralises every spreadsheet formula prefix", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@command", "\t=1+1"]) {
      const cell = escapeCsvCell(value);
      expect(cell.startsWith('"\'')).toBe(true);
    }
  });

  it("refuses an export above the declared row cap", () => {
    expect(() => assertInquiryExportWithinCap(INQUIRY_EXPORT_MAX_ROWS)).not.toThrow();
    expect(() => assertInquiryExportWithinCap(INQUIRY_EXPORT_MAX_ROWS + 1)).toThrow(
      "The inquiry export is limited to 10000 rows."
    );
  });

  it("derives a filesystem-safe filename from the export instant", () => {
    expect(buildInquiryExportFilename(new Date("2026-11-12T04:00:00.000Z"))).toBe(
      "inquiries-2026-11-12T04-00-00-000Z.csv"
    );
  });
});
