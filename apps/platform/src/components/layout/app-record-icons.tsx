import type React from "react";
import { HomeIcon, SettingsIcon, type IconProps } from "@suite/ui/icons";
import type { AppRecordIconKey } from "./app-record-nav.config";

export type AppRecordIconComponent = React.FC<IconProps>;

/**
 * Exhaustive hub icon registry (H-3.7): an unregistered key fails to compile,
 * and the component never guesses a fallback.
 */
export const APP_RECORD_ICONS: Readonly<Record<AppRecordIconKey, AppRecordIconComponent>> = {
  overview: HomeIcon,
  settings: SettingsIcon,
};
