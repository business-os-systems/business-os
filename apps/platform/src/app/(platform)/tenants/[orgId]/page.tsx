import { redirect } from "next/navigation";

export default async function TenantRecordIndexPage({
  params,
}: {
  readonly params: Promise<{ readonly orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/tenants/${encodeURIComponent(orgId)}/overview`);
}
