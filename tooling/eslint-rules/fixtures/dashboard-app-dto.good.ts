interface InstalledAppRecord {
  readonly appId: string;
}

interface InstalledAppSettings {
  readonly iconName?: string;
}

interface DashboardInstalledAppNav {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly icon: string;
  readonly description: string;
  readonly permission: string;
}

// The shape that must stay valid: a data-transfer object. "icon" is boundary
// data resolved once from settings, not a presentation prop chosen by a branch.
function toInstalledAppNav(
  record: InstalledAppRecord,
  settings: InstalledAppSettings,
): DashboardInstalledAppNav {
  if (settings.iconName) {
    return {
      id: record.appId,
      name: record.appId,
      href: "/" + record.appId,
      icon: settings.iconName,
      description: "",
      permission: record.appId + ":read",
    };
  }
  return {
    id: record.appId,
    name: record.appId,
    href: "/" + record.appId,
    icon: record.appId,
    description: "",
    permission: record.appId + ":read",
  };
}

export { toInstalledAppNav };
