import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@suite/ui";
import { GlobeIcon, ShoppingCartIcon, BuildingIcon, PackageIcon } from "@suite/ui/icons";

export default function OverviewPage() {
  const APPS = [
    {
      title: "Website Builder & Headless CMS",
      code: "App 01",
      desc: "Visual page editor, AST canvas, responsive preview, and edge storefront delivery.",
      href: "/sites",
      icon: GlobeIcon,
      status: "Ready in Studio",
    },
    {
      title: "Lodging Property Management (PMS)",
      code: "App 03",
      desc: "Reservation grid, room inventory, guest check-in, and night audit cutoff.",
      href: "/pms",
      icon: BuildingIcon,
      status: "Configured",
    },
    {
      title: "Restaurant POS & KDS",
      code: "App 04",
      desc: "Fast touch counter ordering, ESC/POS ticket printing, and kitchen stations.",
      href: "/pos",
      icon: ShoppingCartIcon,
      status: "Configured",
    },
    {
      title: "Central Inventory & Stock Requisitions",
      code: "App 05",
      desc: "Multi-warehouse balances, inter-branch transfers, and vendor purchase orders.",
      href: "/inventory",
      icon: PackageIcon,
      status: "Configured",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Executive App Launcher
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome to Riverview Hospitality Group. Select an installed module to launch its workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Card key={app.code} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{app.title}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">
                      {app.code}
                    </Badge>
                  </div>
                </div>
                <Badge variant="default" className="text-xs">
                  {app.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <p className="text-xs text-slate-600 leading-relaxed">{app.desc}</p>
                <Link href={app.href} className="inline-block">
                  <Button variant="default" size="sm">
                    Open Application
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
