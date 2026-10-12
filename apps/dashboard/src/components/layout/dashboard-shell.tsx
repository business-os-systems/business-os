"use client";

import React, { useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { HeaderTopbar } from "./header-topbar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <SidebarNav collapsed={collapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderTopbar onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
