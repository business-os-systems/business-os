import { notFound, redirect } from "next/navigation";
import {
  APP_RECORD_OVERVIEW_SEGMENT,
  appRecordHref,
  isAppRecordId,
} from "@/components/layout/app-record-nav.config";

export default async function AppRecordIndexPage({
  params,
}: {
  readonly params: Promise<{ readonly appId: string }>;
}) {
  const { appId } = await params;
  if (!isAppRecordId(appId)) {
    return notFound();
  }
  redirect(appRecordHref(appId, APP_RECORD_OVERVIEW_SEGMENT));
}
