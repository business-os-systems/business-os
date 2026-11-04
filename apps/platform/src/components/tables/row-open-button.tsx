"use client";

import type { KeyboardEvent, ReactNode } from "react";

/**
 * The first cell carries the row's activation target, so a keyboard user
 * reaches every row with Tab and opens it with Enter or Space. The row-level
 * click stays as a mouse convenience.
 */
export function RowOpenButton({
  rowLabel,
  onOpen,
  children,
}: {
  readonly rowLabel: string;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpen();
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={handleKeyDown}
      className="rounded-sm text-left text-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="sr-only">Open </span>
      {children}
      <span className="sr-only"> {rowLabel}</span>
    </button>
  );
}
