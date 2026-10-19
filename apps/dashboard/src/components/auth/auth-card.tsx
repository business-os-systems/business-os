import React from "react";
import { cn } from "@suite/ui";

/**
 * Brand & Title header configuration for authentication card (ISP).
 */
export interface AuthCardHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

/**
 * Layout slot contents for authentication card (ISP).
 */
export interface AuthCardSlotProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export type AuthCardSize = "sm" | "md" | "lg" | "xl";

/**
 * Composite AuthCard properties.
 */
export interface AuthCardProps extends AuthCardHeaderProps, AuthCardSlotProps {
  size?: AuthCardSize;
  className?: string;
}

const sizeStyles: Record<AuthCardSize, string> = {
  sm: "max-w-[400px]",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
};

/**
 * Centered envelope card layout container complying with DESIGN.md:
 * - Default fixed/max-width: 400px (sm) or configurable wide rectangle (xl: max-w-3xl)
 * - Border: 1px border-border
 * - Elevation: shadow-level-2
 * - Radii: rounded-xl
 * - Colors: bg-surface, text-text, text-secondary
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  badge,
  size = "sm",
  className,
}: AuthCardProps) {
  return (
    <div className="w-full min-h-[calc(100vh-6rem)] flex items-center justify-center p-4 sm:p-6 text-text transition-colors duration-base my-auto">
      {/* Envelope Card with all branding, content, and footer inside */}
      <div
        className={cn(
          "w-full bg-surface border border-border rounded-xl shadow-level-2 p-5 sm:p-6 flex flex-col gap-3.5",
          sizeStyles[size],
          className
        )}
      >
        {/* Brand Header inside card */}
        <div className="flex flex-col items-center text-center">
          <div className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center shadow-xs mb-2 text-on-brand font-bold text-sm tracking-wider">
            OS
          </div>
          <span className="text-[10px] uppercase tracking-widest font-semibold text-text-muted mb-0.5">
            Business OS
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-xs text-text-secondary max-w-[320px] leading-relaxed">
              {subtitle}
            </p>
          )}
          {badge && (
            <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-tint text-brand-text">
              {badge}
            </span>
          )}
        </div>

        {/* Card Body / Form Elements */}
        <div className="flex flex-col gap-3">
          {children}
        </div>

        {/* Secondary Footer Links inside card */}
        {footer && (
          <div className="pt-3 border-t border-border/50 text-center text-xs text-text-muted">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
