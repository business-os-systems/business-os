/**
 * Install metadata carried inside InstalledApp.settings.
 *
 * The install and onboarding paths write a manifest snapshot plus installedBy
 * into the same JSONB column that also holds app configuration. Platform's
 * settings editor validates and replaces only the configuration keys, so it
 * must preserve every key below untouched (FR-111). installedBy is a personal
 * data reference and is never returned by the settings API.
 */
export const INSTALLED_APP_SETTINGS_METADATA_KEYS = [
  "code",
  "name",
  "title",
  "href",
  "iconName",
  "description",
  "permission",
  "installedBy",
] as const;

export type InstalledAppSettingsMetadataKey =
  (typeof INSTALLED_APP_SETTINGS_METADATA_KEYS)[number];

const METADATA_KEY_SET: ReadonlySet<string> = new Set(
  INSTALLED_APP_SETTINGS_METADATA_KEYS
);

export function isInstalledAppSettingsMetadataKey(key: string): boolean {
  return METADATA_KEY_SET.has(key);
}
