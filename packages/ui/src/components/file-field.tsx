"use client";

import React from "react";
import { PlusIcon } from "../icons/index.js";
import { Label } from "./label.js";

export interface FileFieldProps {
  readonly id: string;
  readonly label: string;
  readonly accept: string;
  readonly actionLabel: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onChange: (file: File | null) => void;
}

/**
 * One file control for every upload surface. The native input stays in the
 * accessibility tree and keeps keyboard focus; its browser chrome is replaced
 * by a token-based action so the control matches the design system.
 */
export function FileField({
  id,
  label,
  accept,
  actionLabel,
  hint,
  disabled = false,
  onChange,
}: FileFieldProps) {
  return (
    <Label htmlFor={id} size="md" className="block">
      {label}
      <span className="mt-1.5 block rounded-lg border border-dashed border-border-strong bg-surface-muted p-3">
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
          className="peer sr-only"
        />
        <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-text peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </span>
        <span className="mt-2 block text-xs text-text-muted">{hint}</span>
      </span>
    </Label>
  );
}
