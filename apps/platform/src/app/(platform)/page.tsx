import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";

export default function PlatformOverviewPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Operator control plane for Business OS.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Operator access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-text-secondary">
          Navigation is limited to the capabilities granted to your operator
          account. No tenant business data is writable from this surface.
        </CardContent>
      </Card>
    </div>
  );
}
