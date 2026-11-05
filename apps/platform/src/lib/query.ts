export type QueryValue = string | number | undefined;

/** One query-string builder for the Platform clients; undefined entries vanish. */
export function buildQueryString(
  params: Readonly<Record<string, QueryValue>>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const value = search.toString();
  return value === "" ? "" : `?${value}`;
}
