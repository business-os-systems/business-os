import React from "react";

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

/**
 * Composite AuthCard properties.
 */
export interface AuthCardProps extends AuthCardHeaderProps, AuthCardSlotProps {}

/**
 * Centered 400px envelope card layout container complying with DESIGN.md modal-sm:
 * - Fixed/max-width: 400px
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
}: AuthCardProps) {
  return (
    <div className="w-full flex items-center justify-center text-text transition-colors duration-base">
      {/* 400px Modal-SM Envelope Card with all branding, content, and footer inside */}
      <div className="w-full max-w-[400px] bg-surface border border-border rounded-xl shadow-level-2 p-5 sm:p-6 flex flex-col gap-3.5">
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
