import React from "react";
import { Button } from "@suite/ui";
import type { NavbarBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface NavbarBlockComponentProps {
  props: NavbarBlockProps;
  styles?: BlockStyleTokens;
}

export function NavbarBlock({ props, styles }: NavbarBlockComponentProps) {
  const containerStyle: React.CSSProperties = {
    backgroundColor: styles?.backgroundColor || "#ffffff",
    color: styles?.textColor || "#0f172a",
  };

  return (
    <header
      data-block-type="navbar"
      style={containerStyle}
      className={`w-full border-b border-slate-100 sticky top-0 z-50 shadow-sm ${styles?.customClassName || ""}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {props.logoUrl ? (
            <img src={props.logoUrl} alt={props.logoText || "Logo"} className="h-8 w-auto" />
          ) : null}
          {props.logoText ? (
            <span className="font-bold text-lg tracking-tight text-slate-900">
              {props.logoText}
            </span>
          ) : null}
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {props.items.map((item) => (
            <a
              key={item.id}
              href={item.target.url}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {props.ctaButton ? (
          <div>
            <a href={props.ctaButton.target.url}>
              <Button size="sm">{props.ctaButton.label}</Button>
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}
