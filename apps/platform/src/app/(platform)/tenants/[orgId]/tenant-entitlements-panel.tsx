"use client";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@suite/ui";

export function TenantEntitlementsPanel({
  apps,
}: {
  readonly apps: readonly string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Installed apps</CardTitle>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <p className="text-sm text-text-secondary">
            This tenant has no installed apps.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {apps.map((appId) => (
              <li key={appId}>
                <Badge variant="tertiary">{appId}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
