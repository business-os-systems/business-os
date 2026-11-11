"use client";

import React, { useEffect, useState } from "react";
import { readProblemMessage } from "@/lib/problem-details";

/**
 * Unread inquiry count for the Inquiries destination (FR-129). Fail-closed: a
 * denied or failed read renders no badge at all rather than a stale number.
 */
export function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function parseCount(body: unknown): number | null {
  if (typeof body !== "object" || body === null || !("count" in body)) {
    return null;
  }
  const { count } = body;
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

export function InquiryUnreadBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let isActive = true;
    fetch("/api/cms/inquiries/unread-count", {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            readProblemMessage(body) ?? "The unread count request failed with status " + response.status + "."
          );
        }
        const parsed = parseCount(body);
        if (isActive && parsed !== null) {
          setCount(parsed);
        }
      })
      .catch((error: unknown) => {
        console.error(
          "Unread inquiry count unavailable:",
          error instanceof Error ? error.message : String(error)
        );
        if (isActive) {
          setCount(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  if (count === null || count <= 0) {
    return null;
  }
  return (
    <span
      aria-label={formatUnreadCount(count) + " unread inquiries"}
      className="ml-auto shrink-0 rounded-full border border-border bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand"
    >
      {formatUnreadCount(count)}
    </span>
  );
}
