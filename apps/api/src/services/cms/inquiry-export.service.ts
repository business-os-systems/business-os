/**
 * The platform API's named entry point for inquiry exports (FR-047). The CSV
 * format, tenant scope and PII audit live in @suite/website-builder/inquiries
 * so the dashboard BFF uses the same implementation rather than a second copy.
 */
export { exportTenantInquiries } from "@suite/website-builder/inquiries";
