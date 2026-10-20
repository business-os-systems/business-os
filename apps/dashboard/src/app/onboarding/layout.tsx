import React from "react";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-dvh w-full bg-background flex flex-col items-center justify-center p-4 sm:p-6 text-text">
      <div className="w-full flex justify-center mb-4 sm:mb-6">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center shadow-xs text-on-brand font-bold text-sm tracking-wider">
            OS
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-text">
              Business OS
            </span>
            <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted">
              Enterprise Workspace
            </span>
          </div>
        </div>
      </div>
      <div className="w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
