/**
 * The generated form writes the same draft object the JSON tab edits. Paths are
 * dot-separated; unsafe segments are refused so a field name can never reach
 * the prototype chain (CWE-1321).
 */

const BLOCKED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isSafePathSegment(segment: string): boolean {
  return SAFE_SEGMENT.test(segment) && !BLOCKED_SEGMENTS.has(segment);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPath(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const segment of path.split(".")) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function writeInto(
  source: unknown,
  segments: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [segment, ...rest] = segments;
  const base: Record<string, unknown> = isRecord(source) ? source : {};
  if (segment === undefined) {
    return base;
  }
  return { ...base, [segment]: rest.length === 0 ? value : writeInto(base[segment], rest, value) };
}

/** Returns a new draft with one declared field replaced. */
export function writeDraftPath<T extends object>(
  draft: T,
  path: string,
  value: unknown,
): T {
  const segments = path.split(".");
  if (segments.length === 0 || !segments.every(isSafePathSegment)) {
    return draft;
  }
  return writeInto(draft, segments, value) as unknown as T;
}
