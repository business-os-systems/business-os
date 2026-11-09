import { PERMISSIONS, hasPermission } from "@suite/core";
import { buildInstalledAppSettings } from "./app-manifest-settings";
import { prisma } from "@suite/db";


export interface InstalledAppDto {
  readonly id: string;
  readonly appId: string;
  readonly name: string;
  readonly title: string;
  readonly code: string;
  readonly description: string;
  readonly href: string;
  readonly iconName: string;
  readonly permission: string;
  readonly version: string;
  readonly isEnabled: boolean;
  readonly installedAt: string;
}

export type InstallApplicationResult =
  | { readonly status: "email_unverified" }
  | { readonly status: "forbidden" }
  | { readonly status: "installed"; readonly appId: string; readonly installedAt: Date };

interface InstalledAppRow {
  readonly id: string;
  readonly appId: string;
  readonly version: string;
  readonly isEnabled: boolean;
  readonly installedAt: Date;
  readonly settings: unknown;
}

function readSettingsRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === "string" ? value : undefined;
}

function mapInstalledApp(record: InstalledAppRow): InstalledAppDto {
  const settings = readSettingsRecord(record.settings);
  const title = readSetting(settings, "title") ?? readSetting(settings, "name") ?? record.appId;
  return {
    id: record.id,
    appId: record.appId,
    name: readSetting(settings, "name") ?? title,
    title,
    code: readSetting(settings, "code") ?? record.appId,
    description: readSetting(settings, "description") ?? "",
    href: readSetting(settings, "href") ?? `/${record.appId}`,
    iconName: readSetting(settings, "iconName") ?? record.appId,
    permission: readSetting(settings, "permission") ?? `${record.appId}:read`,
    version: record.version,
    isEnabled: record.isEnabled,
    installedAt: record.installedAt.toISOString(),
  };
}

export async function listInstalledApps(organizationId: string): Promise<InstalledAppDto[]> {
  const records = await prisma.installedApp.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: { installedAt: "asc" },
  });
  return records.map(mapInstalledApp);
}

async function isInstallerEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerified: true },
  });
  return user?.emailVerified === true;
}

async function resolveDynamicPermissions(
  userId: string,
  organizationId: string
): Promise<string[]> {
  const assignments = await prisma.userBranchRole.findMany({
    where: { userId, organizationId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  return assignments.flatMap((assignment) =>
    assignment.role.permissions
      .map((entry) => entry.permission.action)
      .filter((action): action is string => typeof action === "string")
  );
}

async function hasInstallCapability(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly sessionPermissions: readonly string[];
}): Promise<boolean> {
  if (hasPermission(input.sessionPermissions, PERMISSIONS.APPS.INSTALL)) {
    return true;
  }
  const dynamicPermissions = await resolveDynamicPermissions(input.userId, input.organizationId);
  return hasPermission(dynamicPermissions, PERMISSIONS.APPS.INSTALL);
}

export async function installApplication(input: {
  readonly organizationId: string;
  readonly appId: string;
  readonly userId: string;
  readonly sessionPermissions: readonly string[];
}): Promise<InstallApplicationResult> {
  if (!(await isInstallerEmailVerified(input.userId))) {
    return { status: "email_unverified" };
  }

  const permitted = await hasInstallCapability(input);
  if (!permitted) {
    return { status: "forbidden" };
  }

  const { manifest, settings } = buildInstalledAppSettings(input.appId, input.userId);
  const installed = await prisma.installedApp.upsert({
    where: {
      organizationId_appId: { organizationId: input.organizationId, appId: input.appId },
    },
    update: { isEnabled: true },
    create: {
      organizationId: input.organizationId,
      appId: input.appId,
      version: manifest?.version ?? "1.0.0",
      isEnabled: true,
      settings,
    },
  });

  return { status: "installed", appId: installed.appId, installedAt: installed.installedAt };
}
