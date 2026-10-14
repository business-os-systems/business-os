import React from "react";
import { cn } from "../lib/utils.js";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "secondary"
    | "tertiary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer";

    const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default:
        "bg-action text-on-action hover:bg-action-hover focus-visible:ring-focus-ring",
      secondary:
        "bg-surface text-text border border-border-strong hover:bg-surface-muted focus-visible:ring-focus-ring",
      tertiary:
        "bg-surface-muted text-text hover:bg-surface-sunken focus-visible:ring-focus-ring",
      destructive:
        "bg-danger text-text-inverse hover:opacity-90 focus-visible:ring-danger",
      outline:
        "border border-border-strong bg-surface hover:bg-surface-muted text-text focus-visible:ring-focus-ring",
      ghost:
        "bg-transparent hover:bg-surface-muted text-text-secondary focus-visible:ring-focus-ring",
      link: "text-action underline-offset-4 hover:underline focus-visible:ring-focus-ring",
    };

    const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-12 rounded-md px-8 text-base",
      icon: "h-10 w-10 p-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
