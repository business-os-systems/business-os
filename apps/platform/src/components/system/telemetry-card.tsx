import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";

export interface TelemetryCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function TelemetryCard({ title, children }: TelemetryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
