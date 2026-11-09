"use client";

import { Alert, Button } from "@suite/ui";
import { isCatalogVersionConflict } from "@/lib/problem-error";

/**
 * One RFC 7807 alert for the catalog forms. Only a stale version offers a
 * reload; a duplicate code shows the server detail and nothing else, because
 * reloading cannot resolve it.
 */
export function CatalogFormAlert({
  error,
  cause,
  onReload,
}: {
  readonly error: string | null;
  readonly cause: unknown;
  readonly onReload: () => void;
}) {
  if (error === null) {
    return null;
  }
  return (
    <div className="space-y-2">
      <Alert variant="error" message={error} />
      {isCatalogVersionConflict(cause) ? (
        <Button variant="secondary" size="sm" onClick={onReload}>
          Reload catalog
        </Button>
      ) : null}
    </div>
  );
}
