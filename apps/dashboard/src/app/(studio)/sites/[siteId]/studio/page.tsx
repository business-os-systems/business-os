import React from "react";
import { requireAuth } from "@/lib/auth-guard";
import { StudioEntry } from "@/components/studio/studio-entry";

export default async function StudioHomePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireAuth();
  const { siteId } = await params;
  return <StudioEntry siteId={siteId} userId={session.userId} />;
}
