import {
  PLATFORM_CAPABILITY_CODES,
  getPlatformCapability,
  type PlatformCapability,
} from "@suite/core";
import type { ConfigFormField } from "./config-form.types";

/**
 * The capability editor renders the compiled registry, never a hand-written
 * list. Each checkbox is one registry capability, so a new capability appears
 * here automatically and an unregistered string can never be granted.
 */
/** The shared form engine is string-valued; the domain plan stays closed. */
export type CapabilityFormValues = Record<string, string>;

const KNOWN_CAPABILITY_CODES: ReadonlySet<string> = new Set(
  PLATFORM_CAPABILITY_CODES,
);

export const CAPABILITY_FORM_FIELDS: readonly ConfigFormField<CapabilityFormValues>[] =
  PLATFORM_CAPABILITY_CODES.map(
    (code): ConfigFormField<CapabilityFormValues> => {
      const definition = getPlatformCapability(code);
      return {
        name: code,
        type: "checkbox",
        label: definition.label,
        description: definition.description,
        colSpan: 1,
      };
    },
  );

export function capabilityFormValues(
  capabilities: readonly string[],
): CapabilityFormValues {
  const selected = new Set(capabilities);
  const values: CapabilityFormValues = {};
  for (const code of PLATFORM_CAPABILITY_CODES) {
    values[code] = selected.has(code) ? "true" : "false";
  }
  return values;
}

export function selectedCapabilities(
  values: CapabilityFormValues,
): readonly PlatformCapability[] {
  return PLATFORM_CAPABILITY_CODES.filter((code) => values[code] === "true");
}

/** Capability strings the registry cannot enforce are shown as a warning, never toggled. */
export function unknownCapabilities(
  capabilities: readonly string[],
): readonly string[] {
  return capabilities.filter((code) => !KNOWN_CAPABILITY_CODES.has(code));
}

export interface CapabilityChangePlan {
  readonly grant: readonly PlatformCapability[];
  readonly revoke: readonly PlatformCapability[];
}

/** The diff is registry-ordered, so a repeat of the same edit is byte-identical. */
export function planCapabilityChange(
  current: readonly string[],
  selected: readonly PlatformCapability[],
): CapabilityChangePlan {
  const currentKnown = new Set(
    current.filter((code) => KNOWN_CAPABILITY_CODES.has(code)),
  );
  const selectedKnown = new Set(
    selected.filter((code) => KNOWN_CAPABILITY_CODES.has(code)),
  );
  return {
    grant: PLATFORM_CAPABILITY_CODES.filter(
      (code) => selectedKnown.has(code) && !currentKnown.has(code),
    ),
    revoke: PLATFORM_CAPABILITY_CODES.filter(
      (code) => currentKnown.has(code) && !selectedKnown.has(code),
    ),
  };
}

export function describeCapabilityChange(
  plan: CapabilityChangePlan,
): string {
  if (plan.grant.length === 0 && plan.revoke.length === 0) {
    return "No changes to save.";
  }
  const parts: string[] = [];
  if (plan.grant.length > 0) {
    parts.push(`${plan.grant.length} to grant`);
  }
  if (plan.revoke.length > 0) {
    parts.push(`${plan.revoke.length} to revoke`);
  }
  return `Unsaved changes: ${parts.join(" and ")}.`;
}
