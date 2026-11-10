import {
  PLATFORM_ERROR_CODE,
  isCatalogKey,
  type CatalogKey,
} from "@suite/core";
import { NotFoundError } from "@suite/core/errors";

export function assertCatalogKey(value: string): CatalogKey {
  if (!isCatalogKey(value)) {
    throw new NotFoundError(`Unknown reference catalog: ${value}.`, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG,
    });
  }
  return value;
}
