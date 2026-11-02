import type React from "react";
import {
  BuildingIcon,
  HomeIcon,
  MonitorIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  type IconProps,
} from "@suite/ui/icons";
import type { PlatformNavIconKey } from "./navigation.config";

export type PlatformIconComponent = React.FC<IconProps>;

export const PLATFORM_NAV_ICONS: Readonly<
  Record<PlatformNavIconKey, PlatformIconComponent>
> = {
  home: HomeIcon,
  tenants: BuildingIcon,
  flags: SettingsIcon,
  audit: ShieldIcon,
  operators: UsersIcon,
  system: MonitorIcon,
};
