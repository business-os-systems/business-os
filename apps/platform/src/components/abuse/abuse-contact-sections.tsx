import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import {
  ABUSE_RESPONSE_STEPS,
  ABUSE_SCOPE_NOTICES,
} from "./abuse-contact.config";

export function AbuseContactCard({ contactEmail }: { readonly contactEmail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monitored contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-text-secondary">
          Reports reach the platform operator queue. This address is monitored
          during the support window and every report produces an intake record
          with its outcome.
        </p>
        <a
          className="text-sm font-semibold text-brand underline underline-offset-4"
          href={"mailto:" + contactEmail}
        >
          {contactEmail}
        </a>
      </CardContent>
    </Card>
  );
}

export function AbuseResponsePathCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Response path</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {ABUSE_RESPONSE_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-xs font-semibold text-text-secondary">
                {index + 1}
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-text">{step.title}</p>
                <p className="text-sm text-text-secondary">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function AbuseScopeCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ABUSE_SCOPE_NOTICES.map((notice) => (
        <Card key={notice.title}>
          <CardHeader>
            <CardTitle className="text-base">{notice.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">{notice.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
