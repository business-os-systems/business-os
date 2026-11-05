import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ValidationError } from "@suite/core/errors";

/** Opaque, stable cursor for lists sorted by a cuid primary key. */
function encodeIdCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/** Slices a take(limit + 1) result and returns the opaque next cursor. */
export function pageSlice<T>(
  rows: readonly T[],
  limit: number,
  idOf: (row: T) => string
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined
        ? encodeIdCursor(idOf(last))
        : null,
  };
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
