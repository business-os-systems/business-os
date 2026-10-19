"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils.js";
import { Button } from "./button.js";
import { ChevronDownIcon, CheckIcon } from "../icons/index.js";
import { isBrowser } from "../env.js";

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  hasError?: boolean;
  className?: string;
  onChange?: (value: string) => void;
  direction?: "auto" | "down" | "up";
}

/**
 * Select
 *
 * Accessible, declarative select dropdown primitive.
 * Adheres strictly to DESIGN.md tokens:
 * - Trigger rendered with Button primitive and centered bold rotating chevron
 * - List options with hover:bg-surface-hover and brand-tint / brand-text selected highlight
 */
export function Select({
  id,
  name,
  value: controlledValue,
  defaultValue,
  options,
  placeholder = "Select an option",
  disabled = false,
  required = false,
  hasError = false,
  className,
  onChange,
  direction = "auto",
}: SelectProps) {
  const [internalValue, setInternalValue] = useState<string>(
    controlledValue ?? defaultValue ?? "",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeValue = controlledValue !== undefined ? controlledValue : internalValue;

  useEffect(() => {
    if (isOpen && containerRef.current && isBrowser) {
      if (direction === "down") {
        setOpenUpward(false);
        return;
      }
      if (direction === "up") {
        setOpenUpward(true);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Only open upward if space below is critically constrained (< 140px) AND space above has plenty of clearance (> 240px)
      if (spaceBelow < 140 && spaceAbove > 240) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen, direction]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isBrowser) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, []);

  const handleSelect = (optionValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(optionValue);
    }
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find((opt) => opt.value === activeValue);
  const displayLabel = selectedOption?.label || activeValue || placeholder;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={activeValue}
          required={required}
        />
      )}

      <Button
        type="button"
        id={id}
        variant="outline"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsOpen(false);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "w-full h-auto px-3 py-2 justify-between text-left font-normal bg-surface border-border text-text hover:bg-surface-hover focus-visible:ring-action/20",
          hasError && "border-danger focus-visible:ring-danger/20",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span className="truncate pr-2">{displayLabel}</span>
        <ChevronDownIcon
          strokeWidth={2.5}
          className={cn(
            "h-4 w-4 mr-1 text-text-secondary transition-transform duration-200 shrink-0 stroke-[2.5]",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </Button>

      {isOpen && (
        <ul
          role="listbox"
          aria-labelledby={id}
          className={cn(
            "absolute left-0 right-0 max-h-52 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl z-[70] animate-in fade-in duration-150",
            openUpward
              ? "bottom-full mb-1.5 slide-in-from-bottom-1"
              : "top-full mt-1.5 slide-in-from-top-1",
          )}
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-text-muted text-center select-none">
              No options available
            </li>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === activeValue;
              const isOptDisabled = Boolean(opt.disabled);

              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={isOptDisabled}
                  onClick={() => !isOptDisabled && handleSelect(opt.value)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-xs rounded-md cursor-pointer transition-colors",
                    isSelected
                      ? "bg-brand-tint text-brand dark:text-brand-text font-semibold"
                      : "text-text hover:bg-surface-hover hover:text-text",
                    isOptDisabled &&
                      "opacity-40 cursor-not-allowed hover:bg-transparent",
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-text-muted truncate">
                        {opt.description}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <CheckIcon
                      strokeWidth={2.5}
                      className="h-3.5 w-3.5 text-brand dark:text-brand-text shrink-0 ml-2"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
