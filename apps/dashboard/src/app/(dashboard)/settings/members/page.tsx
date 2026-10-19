import React from "react";
import { requireAuth } from "@/lib/auth-guard";
import {
  listOrganizationMembers,
  listOrganizationRoles,
} from "@/services/members.service";
import { listOrganizationBranches } from "@/services/branches.service";
import { MembersClient } from "./members-client";

export default async function MembersSettingsPage() {
  const session = await requireAuth();

  const [members, roles, branches] = await Promise.all([
    listOrganizationMembers(session.organizationId),
    listOrganizationRoles(session.organizationId),
    listOrganizationBranches(session.organizationId),
  ]);

  return (
    <MembersClient
      initialMembers={members}
      roles={roles}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      organizationId={session.organizationId}
      userPermissions={session.permissions}
    />
  );
}
