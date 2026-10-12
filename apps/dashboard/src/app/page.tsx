import React from "react";
import { Button, Badge } from "@suite/ui";
import { LayersIcon, CheckIcon } from "@suite/ui/icons";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-xl p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center space-y-6">
        <div className="flex items-center justify-center space-x-2">
          <LayersIcon className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">Composable Business OS</h1>
        </div>
        <p className="text-slate-600 text-sm">
          Multi-Tenant Admin Portal &amp; Modular App Launcher.
        </p>
        <div className="flex items-center justify-center space-x-3">
          <Badge variant="success" className="inline-flex items-center gap-1">
            <CheckIcon className="w-3.5 h-3.5" />
            Port 3001 Ready
          </Badge>
          <Badge variant="default">Next.js 15 App Router</Badge>
        </div>
        <div className="pt-4 border-t border-slate-100 flex justify-center">
          <Button variant="default">Launch Studio</Button>
        </div>
      </div>
    </main>
  );
}
