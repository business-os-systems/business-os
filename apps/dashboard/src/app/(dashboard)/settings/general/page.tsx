import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  decodeSessionPayload,
  type SessionPayload,
} from "@/lib/auth-constants";
import { Alert } from "@suite/ui";
import { GeneralSettingsClient } from "./general-client";

function isAuthenticatedSession(
  session: SessionPayload | null,
): session is SessionPayload & {
  organizationId: string;
  organizationName: string;
  userName: string;
  email: string;
} {
  return Boolean(
    session &&
    session.userId &&
    session.organizationId &&
    session.organizationName &&
    session.userName &&
    session.email,
  );
}

export default async function GeneralSettingsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const rawSession = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  if (!isAuthenticatedSession(rawSession)) {
    redirect("/login");
  }

  const session = rawSession;

  const organization = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      currency: true,
      country: true,
      defaultLocale: true,
      jurisdiction: true,
      status: true,
    },
  });

  if (!organization) {
    return (
      <div className="max-w-4xl py-6">
        <Alert variant="error" title="Organization Not Found">
          Active organization could not be found. Please contact support.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <GeneralSettingsClient
        initialData={{
          name: organization.name,
          customDomain: organization.customDomain ?? "",
          currency: organization.currency,
          country: organization.country,
          defaultLocale: organization.defaultLocale,
          jurisdiction: organization.jurisdiction,
        }}
        organizationId={organization.id}
        slug={organization.slug}
        userPermissions={session.permissions ?? []}
      />
    </div>
  );
}
