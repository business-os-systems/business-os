"use client";

import React from "react";
import {
  GlobeIcon,
  ShoppingCartIcon,
  BuildingIcon,
  PackageIcon,
  SettingsIcon,
  HomeIcon,
  MapPinIcon,
  StoreIcon,
  GitBranchIcon,
  UsersIcon,
  ShieldIcon,
  type IconProps,
} from "@suite/ui/icons";

export type IconComponent = React.FC<IconProps>;

/**
 * Canonical Navigation Application Keys (Single Source of Truth)
 * Exhaustively defines all valid icon keys supported by the primary navigation sidebar.
 */
export const CANONICAL_NAV_ICON_KEYS = [
  "home",
  "sites",
  "website-builder",
  "website_builder",
  "pos",
  "restaurant-pos",
  "restaurant_pos",
  "retail-pos",
  "retail_pos",
  "pms",
  "lodging-pms",
  "lodging_pms",
  "inventory",
  "inventory-tracker",
  "inventory_tracker",
  "stock-inventory",
  "stock_inventory",
  "settings",
] as const;

export type NavIconKey = (typeof CANONICAL_NAV_ICON_KEYS)[number];

/**
 * Deterministic Navigation Icon Registry
 * Exhaustively maps all canonical navigation keys to their SVG components.
 * Prevents missing keys at compile time and runtime heuristic guessing.
 */
export const NAV_ICON_REGISTRY: Readonly<Record<NavIconKey, IconComponent>> = {
  home: HomeIcon,
  sites: GlobeIcon,
  "website-builder": GlobeIcon,
  website_builder: GlobeIcon,
  pos: ShoppingCartIcon,
  "restaurant-pos": ShoppingCartIcon,
  restaurant_pos: ShoppingCartIcon,
  "retail-pos": ShoppingCartIcon,
  retail_pos: ShoppingCartIcon,
  pms: BuildingIcon,
  "lodging-pms": BuildingIcon,
  lodging_pms: BuildingIcon,
  inventory: PackageIcon,
  "inventory-tracker": PackageIcon,
  inventory_tracker: PackageIcon,
  "stock-inventory": PackageIcon,
  stock_inventory: PackageIcon,
  settings: SettingsIcon,
};

/**
 * Canonical Settings Hub Category Keys
 */
export const CANONICAL_SETTINGS_CATEGORY_KEYS = [
  "building",
  "general",
  "map-pin",
  "branches",
  "store",
  "git-branch",
  "addresses",
  "users",
  "members",
  "shield",
  "roles",
  "settings",
] as const;

export type SettingsCategoryIconKey =
  (typeof CANONICAL_SETTINGS_CATEGORY_KEYS)[number];

/**
 * Deterministic Settings Hub Icon Registry
 * Exhaustively maps settings category icon keys to their SVG components.
 */
export const SETTINGS_ICON_REGISTRY: Readonly<
  Record<SettingsCategoryIconKey, IconComponent>
> = {
  building: BuildingIcon,
  general: BuildingIcon,
  "map-pin": MapPinIcon,
  branches: StoreIcon,
  store: StoreIcon,
  "git-branch": GitBranchIcon,
  addresses: MapPinIcon,
  users: UsersIcon,
  members: UsersIcon,
  shield: ShieldIcon,
  roles: ShieldIcon,
  settings: SettingsIcon,
};

/**
 * Type guard validating whether a key belongs to the canonical navigation icon registry.
 */
export function isKnownNavIconKey(key: string): key is NavIconKey {
  return (CANONICAL_NAV_ICON_KEYS as readonly string[]).includes(key);
}

/**
 * Type guard validating whether a key belongs to the canonical settings category registry.
 */
export function isKnownSettingsCategoryIconKey(
  key: string
): key is SettingsCategoryIconKey {
  return (CANONICAL_SETTINGS_CATEGORY_KEYS as readonly string[]).includes(key);
}

/**
 * Resolves a navigation icon deterministically without cascading fallback chains.
 */
export function getNavIcon(iconKey: string): IconComponent {
  const normalizedKey = iconKey.toLowerCase().replace(/_/g, "-");
  const snakeKey = iconKey.toLowerCase().replace(/-/g, "_");

  let icon: IconComponent | undefined;
  if (isKnownNavIconKey(iconKey)) {
    icon = NAV_ICON_REGISTRY[iconKey];
  } else if (isKnownNavIconKey(normalizedKey)) {
    icon = NAV_ICON_REGISTRY[normalizedKey];
  } else if (isKnownNavIconKey(snakeKey)) {
    icon = NAV_ICON_REGISTRY[snakeKey];
  }

  if (!icon) {
    throw new Error(
      `[IconRegistry] Unregistered navigation icon key: "${iconKey}". Every navigation item must specify a registered icon.`
    );
  }
  return icon;
}

/**
 * Resolves a settings category icon deterministically without cascading fallback chains.
 */
export function getSettingsIcon(iconKey: string): IconComponent {
  if (isKnownSettingsCategoryIconKey(iconKey)) {
    return SETTINGS_ICON_REGISTRY[iconKey];
  }
  throw new Error(
    `[IconRegistry] Unregistered settings category icon key: "${iconKey}". Every settings category must specify a registered icon.`
  );
}
