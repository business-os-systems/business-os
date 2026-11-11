import { ValidationError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE } from "@suite/core";

/**
 * Opaque cursor for lists sorted by the cuid primary key. The cap and the
 * stable sort live in the service; this module only encodes and slices.
 */
export function encodeIdCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeIdCursor(raw: string): string {
  try {
    const value = Buffer.from(raw, "base64url").toString("utf8");
    if (value.length === 0) {
      throw new Error("empty cursor");
    }
    return value;
  } catch (error) {
    throw new ValidationError("Invalid pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      cause: error,
    });
  }
}

export interface PageSlice<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

export function pageSlice<T>(
  rows: readonly T[],
  limit: number,
  idOf: (row: T) => string
): PageSlice<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  if (rows.length <= limit || last === undefined) {
    return { items, nextCursor: null };
  }
  return { items, nextCursor: encodeIdCursor(idOf(last)) };
}
