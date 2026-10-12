import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@suite/ui";
import { GlobeIcon, ShoppingCartIcon, BuildingIcon, PackageIcon } from "@suite/ui/icons";

interface AppLauncherCard {
  title: string;
  code: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "Available" | "Coming Soon";
  isAvailable: boolean;
}

export default function OverviewPage() {
  const APPS: AppLauncherCard[] = [
    {
      title: "Website Builder & Headless CMS",
      code: "App 01",
      desc: "Visual canvas studio, section blueprints, responsive device preview, and edge storefront delivery.",
      href: "/sites",
      icon: GlobeIcon,
      status: "Available",
      isAvailable: true,
    },
    {
      title: "Lodging Property Management (PMS)",
      code: "App 03",
      desc: "Multi-property reservation calendar, unit inventory, guest check-in, and night audit rollover.",
      href: "/pms",
      icon: BuildingIcon,
      status: "Coming Soon",
      isAvailable: false,
    },
    {
      title: "Restaurant POS & KDS",
      code: "App 04",
      desc: "Fast touch counter ordering, KOT ticket printing, table management, and shift reconciliation.",
      href: "/pos",
      icon: ShoppingCartIcon,
      status: "Coming Soon",
      isAvailable: false,
    },
    {
      title: "Central Inventory & Stock Requisitions",
      code: "App 05",
      desc: "Multi-warehouse stock balances, inter-branch transfers, wastage logs, and vendor procurement.",
      href: "/inventory",
      icon: PackageIcon,
      status: "Coming Soon",
      isAvailable: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Executive App Launcher
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome to your Business OS workspace. Select an installed module to launch its environment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Card key={app.code} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      app.isAvailable
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{app.title}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">
                      {app.code}
                    </Badge>
                  </div>
                </div>
                <Badge
                  variant={app.isAvailable ? "default" : "secondary"}
                  className="text-xs"
                >
                  {app.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <p className="text-xs text-slate-600 leading-relaxed">{app.desc}</p>
                {app.isAvailable ? (
                  <Link href={app.href} className="inline-block">
                    <Button variant="default" size="sm">
                      Open Application
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
