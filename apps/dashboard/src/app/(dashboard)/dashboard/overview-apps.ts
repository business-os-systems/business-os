import { z } from "zod";
import type React from "react";
import { resolveAppIcon } from "@/lib/app-registry";

/**
 * The installed-apps payload is parsed once at the client boundary. The API
 * returns canonical keys (title, code, href, permission); the overview must
 * map those fields directly instead of guessing across aliases (P3/P10).
 */

export interface AppLauncherCard {
  title: string;
  code: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "Available" | "Coming Soon";
  isAvailable: boolean;
  permission?: string;
  accent?: "primary" | "secondary" | "tertiary";
}

export const installedAppSchema = z.object({
  appId: z.string().min(1),
  title: z.string().min(1),
  code: z.string().min(1),
  description: z.string(),
  href: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//"),
      "Installed app links must be internal paths."
    ),
  iconName: z.string().min(1),
  permission: z.string().min(1),
  isEnabled: z.boolean(),
});

export const installedAppsResponseSchema = z.object({
  apps: z.array(installedAppSchema),
  userPermissions: z.array(z.string()).optional(),
});

export type InstalledAppResponse = z.infer<typeof installedAppSchema>;

export interface InstalledAppsPayload {
  readonly apps: readonly InstalledAppResponse[];
  readonly userPermissions?: readonly string[];
}

export type InstalledAppsLoadResult =
  | { readonly kind: "loaded"; readonly payload: InstalledAppsPayload }
  | { readonly kind: "error"; readonly message: string };

export function parseInstalledApps(payload: unknown): InstalledAppsPayload {
  return installedAppsResponseSchema.parse(payload);
}

/**
 * Loads and parses the installed-apps payload. HTTP failures become a typed
 * result; a transport failure still rejects so the caller can log it rather
 * than silently showing an empty workspace.
 */
export async function loadInstalledApps(
  endpoint: string
): Promise<InstalledAppsLoadResult> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    return {
      kind: "error",
      message: `Installed applications request failed with status ${response.status}.`,
    };
  }
  return { kind: "loaded", payload: parseInstalledApps(await response.json()) };
}

const AVAILABILITY_STATE = {
  installed: "installed",
  notInstalled: "notInstalled",
} as const;

type AvailabilityState = (typeof AVAILABILITY_STATE)[keyof typeof AVAILABILITY_STATE];

function availabilityState(isAvailable: boolean): AvailabilityState {
  return isAvailable
    ? AVAILABILITY_STATE.installed
    : AVAILABILITY_STATE.notInstalled;
}

const AVAILABILITY_PRESENTATION = {
  installed: "Available",
  notInstalled: "Coming Soon",
} as const satisfies Record<AvailabilityState, AppLauncherCard["status"]>;

export function toAppLauncherCards(
  apps: readonly InstalledAppResponse[],
  installedAppIds?: readonly string[]
): AppLauncherCard[] {
  const installedSet =
    installedAppIds === undefined || installedAppIds.length === 0
      ? null
      : new Set(installedAppIds);

  return apps.map((app) => {
    const isAvailable =
      installedSet === null ? app.isEnabled : installedSet.has(app.appId);
    return {
      title: app.title,
      code: app.code,
      desc: app.description,
      href: app.href,
      icon: resolveAppIcon(app.iconName),
      status: AVAILABILITY_PRESENTATION[availabilityState(isAvailable)],
      isAvailable,
      permission: app.permission,
    };
  });
}
