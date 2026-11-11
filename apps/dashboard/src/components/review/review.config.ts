import type { ReviewDto } from "@/lib/api/review-client";

export const REVIEW_DEVICES = [
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 375 },
] as const;

export type ReviewDeviceId = (typeof REVIEW_DEVICES)[number]["id"];

export const REVIEW_VIEW_MODES = [
  { id: "pending", label: "Pending changes" },
  { id: "live", label: "Live site" },
] as const;

export type ReviewViewMode = (typeof REVIEW_VIEW_MODES)[number]["id"];

export const REVIEW_CHANGE_NOTE = {
  id: "review-change-note",
  label: "Change note",
  placeholder: "Change note (optional)",
  maxLength: 100,
} as const;

export const REVIEW_STATUS_PRESENTATION = {
  OPEN: { label: "Review in progress", className: "text-text-secondary" },
  READY: { label: "Ready to publish", className: "text-success" },
  STALE: { label: "Fresh review required", className: "text-danger" },
  PUBLISHED: { label: "Published", className: "text-success" },
} as const satisfies Record<ReviewDto["status"], { label: string; className: string }>;

export interface ReviewPageState {
  readonly label: string;
  readonly className: string;
}

export const REVIEW_PAGE_STATE = {
  pending: { label: "Pending changes", className: "text-warning-text" },
  live: { label: "Already live", className: "text-success" },
  notLive: { label: "Not live yet", className: "text-text-secondary" },
} as const satisfies Record<string, ReviewPageState>;

export type ReviewPageStateKey = keyof typeof REVIEW_PAGE_STATE;

export function resolveDevice(deviceId: ReviewDeviceId): (typeof REVIEW_DEVICES)[number] {
  const device = REVIEW_DEVICES.find((entry) => entry.id === deviceId);
  if (device === undefined) {
    throw new Error("Unknown review device: " + deviceId);
  }
  return device;
}

export function pageStateKey(input: {
  readonly changed: boolean;
  readonly publishedAst?: unknown;
}): ReviewPageStateKey {
  if (input.changed) {
    return "pending";
  }
  if (input.publishedAst === null || input.publishedAst === undefined) {
    return "notLive";
  }
  return "live";
}

export function reviewSummary(review: ReviewDto): string {
  const pageWord = review.changedPageCount === 1 ? "page" : "pages";
  return (
    String(review.changedPageCount) +
    " " +
    pageWord +
    " will go live · " +
    String(review.reviewedPageCount) +
    " of " +
    String(review.pages.length) +
    " reviewed (optional)"
  );
}
