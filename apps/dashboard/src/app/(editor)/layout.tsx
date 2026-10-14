import React from "react";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-app="website-builder"
      className="h-screen w-screen overflow-hidden flex flex-col bg-inverse-surface"
    >
      {children}
    </div>
  );
}
