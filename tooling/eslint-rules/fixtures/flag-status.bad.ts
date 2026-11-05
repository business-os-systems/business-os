interface FlagRecord {
  isExpired: boolean;
  isEnabled: boolean;
  defaultEnabled: boolean;
  rules: readonly unknown[];
}

// The pre-refactor flag-status derivation. Kept only as a lint fixture.
function stateText(flag: FlagRecord) {
  if (flag.isExpired) {
    return { label: "Expired", className: "text-danger" };
  }
  if (flag.isEnabled && flag.defaultEnabled) {
    return { label: "On", className: "text-success" };
  }
  if (flag.isEnabled && flag.rules.length > 0) {
    return { label: "Targeted", className: "text-brand" };
  }
  if (flag.isEnabled) {
    return { label: "Master on", className: "text-warning" };
  }
  return { label: "Off", className: "text-text-secondary" };
}

export { stateText };
