import {
  PLATFORM_ERROR_CODE,
  getAppSettingsDefinition,
  type AppSettingsDefinition,
} from "@suite/core";
import { ValidationError } from "@suite/core/errors";

export function requireAppSettingsDefinition(
  appId: string,
): AppSettingsDefinition {
  const definition = getAppSettingsDefinition(appId);
  if (definition === null) {
    throw new ValidationError(
      "The application is not registered in the platform catalog.",
      undefined,
      { code: PLATFORM_ERROR_CODE.UNKNOWN_APP },
    );
  }
  return definition;
}
