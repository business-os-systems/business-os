import React from "react";
import { requireAuth } from "@/lib/auth-guard";
import {
  listOrganizationRolesWithPermissions,
  listSystemPermissions,
} from "@/services/roles.service";
import { RolesClient } from "./roles-client";

export default async function RolesSettingsPage() {
  const session = await requireAuth();
  const [roles, permissions] = await Promise.all([
    listOrganizationRolesWithPermissions(session.organizationId),
    listSystemPermissions(),
  ]);

  return (
    <RolesClient
      initialRoles={roles}
      initialPermissions={permissions}
      userPermissions={session.permissions}
    />
  );
}
