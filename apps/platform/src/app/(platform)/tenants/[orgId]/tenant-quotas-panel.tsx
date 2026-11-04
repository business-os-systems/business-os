"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import type { TenantQuota } from "@/lib/tenant-api";

const HEADER_CLASS =
  "py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary";

export function TenantQuotasPanel({
  quotas,
}: {
  readonly quotas: readonly TenantQuota[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quotas</CardTitle>
      </CardHeader>
      <CardContent>
        {quotas.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No quota is configured for this tenant. Consumption arrives with the
            quotas slice.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={`${HEADER_CLASS} text-left`}>
                  Resource
                </th>
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Limit
                </th>
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Enforced
                </th>
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((quota) => (
                <tr
                  key={quota.resourceKey}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-2 text-text">{quota.resourceKey}</td>
                  <td className="py-2 text-right text-text">
                    {quota.limitValue}
                  </td>
                  <td className="py-2 text-right text-text-secondary">
                    {quota.isEnforced ? "Yes" : "No"}
                  </td>
                  <td className="py-2 text-right text-text-secondary">
                    {formatDateTime(quota.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
