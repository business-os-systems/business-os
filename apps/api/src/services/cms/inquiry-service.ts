/**
 * The platform API's named entry point for inquiry reads and writes (T104).
 * The domain orchestration lives in @suite/website-builder/inquiries so the
 * dashboard uses the same implementation rather than a second copy.
 */
export {
  changeTenantInquiryStatus,
  countTenantUnreadInquiries,
  eraseTenantInquiry,
  getTenantInquiry,
  listTenantInquiries,
  type InquiryListInput,
} from "@suite/website-builder/inquiries";
