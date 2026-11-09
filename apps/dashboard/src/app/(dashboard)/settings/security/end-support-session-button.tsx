"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { endSupportSessionAction } from "./end-support-session-action";

export function EndSupportSessionButton({
  ticketId,
}: {
  readonly ticketId: string;
}) {
  const router = useRouter();
  const [isEnding, setIsEnding] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  async function end(): Promise<void> {
    setIsEnding(true);
    setDetail(null);
    try {
      const result = await endSupportSessionAction(ticketId);
      if (!result.ok) {
        setDetail(result.detail);
        return;
      }
      router.refresh();
    } finally {
      setIsEnding(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        size="sm"
        isLoading={isEnding}
        disabled={isEnding}
        onClick={() => void end()}
      >
        End session
      </Button>
      {detail === null ? null : (
        <span role="alert" className="text-[11px] text-danger">
          {detail}
        </span>
      )}
    </span>
  );
}
