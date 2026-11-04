"use client";

import { formatDateTime } from "@/lib/format";
import type { TenantPiiMember } from "@/lib/tenant-api";

const HEADER_CLASS =
  "py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary";

export function TenantPiiMemberTable({
  members,
}: {
  readonly members: readonly TenantPiiMember[];
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        This tenant has no active member.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className={`${HEADER_CLASS} text-left`}>
            Name
          </th>
          <th scope="col" className={`${HEADER_CLASS} text-left`}>
            Email
          </th>
          <th scope="col" className={`${HEADER_CLASS} text-right`}>
            Joined
          </th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr
            key={member.userId}
            className="border-b border-border last:border-b-0"
          >
            <td className="py-3 text-text">{member.name}</td>
            <td className="py-3 text-text">{member.email}</td>
            <td className="py-3 text-right text-text-secondary">
              {formatDateTime(member.joinedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
