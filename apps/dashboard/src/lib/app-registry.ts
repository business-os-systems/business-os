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

export const APP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sites: GlobeIcon,
  website_builder: GlobeIcon,
  pms: BuildingIcon,
  lodging_pms: BuildingIcon,
  pos: ShoppingCartIcon,
  restaurant_pos: ShoppingCartIcon,
  inventory: PackageIcon,
  stock_inventory: PackageIcon,
};

export function resolveAppIcon(
  iconNameOrAppId?: string
): React.ComponentType<{ className?: string }> {
  if (!iconNameOrAppId) return GlobeIcon;
  return APP_ICONS[iconNameOrAppId] || GlobeIcon;
}
