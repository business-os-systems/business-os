import type { Metadata } from "next";
import { getAbuseContactEmail } from "@/lib/env";
import {
  AbuseContactCard,
  AbuseResponsePathCard,
  AbuseScopeCards,
} from "@/components/abuse/abuse-contact-sections";

export const metadata: Metadata = {
  title: "Report abuse - Business OS",
  description:
    "The monitored abuse contact and the operator response path for published Business OS sites.",
};

export const dynamic = "force-dynamic";

export default function AbuseContactPage() {
  const contactEmail = getAbuseContactEmail();
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-text sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Trust and safety
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-text">Report abuse</h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Business OS publishes customer websites. Use this contact for
            abusive, deceptive or impersonating content hosted on a published
            site.
          </p>
        </header>
        <AbuseContactCard contactEmail={contactEmail} />
        <AbuseResponsePathCard />
        <AbuseScopeCards />
      </div>
    </main>
  );
}
