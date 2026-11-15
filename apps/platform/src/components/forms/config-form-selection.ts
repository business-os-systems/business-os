/**
 * A multi-select value travels through the form renderer as one string. The
 * separator is a unit separator, so a registry value that contains a comma
 * cannot corrupt the selection.
 */
const SEPARATOR = "\u001f";

export function joinSelection(values: readonly string[]): string {
  return values.join(SEPARATOR);
}

export function splitSelection(value: string): readonly string[] {
  if (value.trim() === "") {
    return [];
  }
  return value.split(SEPARATOR).filter((entry) => entry.length > 0);
}
