import type React from "react";
import { LayersIcon, type IconProps } from "@suite/ui/icons";
import type { CatalogsNavIconKey } from "./catalogs-nav.config";

export type CatalogsIconComponent = React.FC<IconProps>;

/** Exhaustive registry: a new catalog icon key fails at compile time (H-3.7). */
export const CATALOGS_NAV_ICONS: Readonly<
  Record<CatalogsNavIconKey, CatalogsIconComponent>
> = {
  catalog: LayersIcon,
};
