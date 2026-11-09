import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { LayersIcon } from "@suite/ui/icons";
import { BREAK_GLASS_HEADER, isBreakGlassAdmitted } from "./break-glass-gate";

export const metadata: Metadata = {
  // The denial page must not advertise the route (FR-068), so the document
  // title stays generic; the admitted card names the recovery procedure.
  title: "Business OS",
  robots: { index: false, follow: false },
};

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-tint text-brand shadow-2xs">
        <LayersIcon className="h-4 w-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-tight text-text">Business OS</span>
        <span className="text-[10px] font-medium text-text-muted">Platform Control</span>
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <Brand />
        <CardTitle className="mt-4 text-xl">Not available</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-secondary">This route is not available.</p>
      </CardContent>
    </Card>
  );
}

function Admitted() {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="space-y-4">
        <Brand />
        <div>
          <CardTitle className="text-xl">Break-glass access</CardTitle>
          <p className="mt-1 text-sm text-text-secondary">
            The offline client certificate was verified before this request reached the application.
            The application never asks for the key.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert
          variant="warning"
          title="Keep the key offline"
          message="Do not paste the private key or a bootstrap token into a chat, ticket or URL query string. The bootstrap token belongs only in the URL fragment (#bootstrap=...), which browsers do not send to the server."
        />
        <ol className="list-decimal space-y-3 pl-5 text-sm text-text-secondary">
          <li>
            Keep the client-certificate private key in its sealed offline storage. This page never
            requests it.
          </li>
          <li>
            On the deployment host, run{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-text">
              pnpm --filter @suite/platform bootstrap-operator
            </code>{" "}
            for the first operator, or follow the owner re-issue procedure in the Platform runbook.
          </li>
          <li>
            Use the single-use link printed by the command on the operator sign-in page, then
            register a passkey. The link is valid once and expires within 24 hours.
          </li>
          <li>
            Close this window and record the date, certificate serial and outcome in the quarterly
            break-glass drill log.
          </li>
        </ol>
        <p className="text-xs text-text-muted">
          The break-glass hostname is a recovery path, not a second sign-in surface. It does not
          share a session with the operator domain.
        </p>
        <p className="text-sm text-text-secondary">
          After the bootstrap, open the canonical operator domain and sign in there. This recovery
          hostname does not share a session with it.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function BreakGlassPage() {
  const requestHeaders = await headers();
  const admitted = isBreakGlassAdmitted(requestHeaders.get(BREAK_GLASS_HEADER));

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {admitted ? <Admitted /> : <Unavailable />}
    </main>
  );
}
