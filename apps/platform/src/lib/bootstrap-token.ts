export function readBootstrapToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("bootstrap")?.trim();
  return token !== undefined && token.length > 0 ? token : null;
}

export interface HistoryWriter {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Removes the single-use token from the address bar and browser history as soon
 * as it has been read, so a later user of the device cannot replay the link.
 */
export function clearBootstrapFragment(
  history: HistoryWriter,
  pathname: string,
  search: string
): void {
  history.replaceState(null, "", `${pathname}${search}`);
}
