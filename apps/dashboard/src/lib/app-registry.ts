import type React from "react";
import {
  GlobeIcon,
  ShoppingCartIcon,
  BuildingIcon,
  PackageIcon,
} from "@suite/ui/icons";

export interface RegistryAppMetadata {
  appId: string;
  name: string;
  title: string;
  code: string;
  description: string;
  href: string;
  iconName: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultEnabled: boolean;
}

export const KNOWN_APPS_CATALOG: Record<string, RegistryAppMetadata> = {
  website_builder: {
    appId: "website_builder",
    name: "Website Builder",
    title: "Website Builder & Headless CMS",
    code: "App 01",
    description: "Visual canvas studio, section blueprints, responsive device preview, and edge storefront delivery.",
    href: "/sites",
    iconName: "sites",
    icon: GlobeIcon,
    defaultEnabled: true,
  },
  lodging_pms: {
    appId: "lodging_pms",
    name: "Lodging PMS",
    title: "Lodging Property Management (PMS)",
    code: "App 03",
    description: "Multi-property reservation calendar, unit inventory, guest check-in, and night audit rollover.",
    href: "/pms",
    iconName: "pms",
    icon: BuildingIcon,
    defaultEnabled: true,
  },
  restaurant_pos: {
    appId: "restaurant_pos",
    name: "Restaurant POS",
    title: "Restaurant POS & KDS",
    code: "App 04",
    description: "Fast touch counter ordering, KOT ticket printing, table management, and shift reconciliation.",
    href: "/pos",
    iconName: "pos",
    icon: ShoppingCartIcon,
    defaultEnabled: true,
  },
  stock_inventory: {
    appId: "stock_inventory",
    name: "Central Stock",
    title: "Central Inventory & Stock Requisitions",
    code: "App 05",
    description: "Multi-warehouse stock balances, inter-branch transfers, wastage logs, and vendor procurement.",
    href: "/inventory",
    iconName: "inventory",
    icon: PackageIcon,
    defaultEnabled: true,
  },
};
