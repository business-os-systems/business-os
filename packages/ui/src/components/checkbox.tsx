import React from "react";
import { cn } from "../lib/utils.js";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, disabled, ...props }, ref) => {
    const generatedId = id || React.useId();

    return (
      <div className="inline-flex items-center space-x-2">
        <input
          type="checkbox"
          id={generatedId}
          ref={ref}
          disabled={disabled}
          className={cn(
            "h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            className
          )}
          {...props}
        />
        {label ? (
          <label
            htmlFor={generatedId}
            className="text-sm font-medium leading-none text-slate-700 select-none cursor-pointer"
          >
            {label}
          </label>
        ) : null}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
