import React from "react";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div data-app="website-builder" className="h-screen w-screen overflow-hidden bg-background">{children}</div>;
}
