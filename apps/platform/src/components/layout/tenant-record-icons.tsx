import type React from "react";
import {
  AlertTriangleIcon,
  ClockIcon,
  HomeIcon,
  LayersIcon,
  PackageIcon,
  type IconProps,
} from "@suite/ui/icons";
import type { TenantRecordIconKey } from "./tenant-record-nav.config";

export type TenantRecordIconComponent = React.FC<IconProps>;

/**
 * Exhaustive hub icon registry (H-3.7): an unregistered key fails to compile,
 * and the component never guesses a fallback.
 */
export const TENANT_RECORD_ICONS: Readonly<
  Record<TenantRecordIconKey, TenantRecordIconComponent>
> = {
  overview: HomeIcon,
  apps: PackageIcon,
  quotas: LayersIcon,
  activity: ClockIcon,
  danger: AlertTriangleIcon,
};
