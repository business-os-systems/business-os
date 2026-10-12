import React from "react";
import type { PageAst } from "../ast/types.js";
import { SectionRenderer } from "./section-renderer.js";

export interface AstRendererProps {
  ast: PageAst;
  isEditor?: boolean;
  className?: string;
}

export function AstRenderer({ ast, isEditor = false, className = "" }: AstRendererProps) {
  if (!ast || !Array.isArray(ast.sections)) {
    return (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">
        No content available to render.
      </div>
    );
  }

  const globalStyle: React.CSSProperties = {
    fontFamily: ast.globalStyles?.fontFamily,
    backgroundColor: ast.globalStyles?.backgroundColor,
    color: ast.globalStyles?.textColor,
  };

  return (
    <main
      data-cms-page="true"
      style={globalStyle}
      className={`min-h-screen w-full flex flex-col ${className}`}
    >
      {ast.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} isEditor={isEditor} />
      ))}
    </main>
  );
}
