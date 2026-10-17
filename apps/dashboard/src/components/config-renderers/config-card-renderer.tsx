import React from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@suite/ui";

export interface MetricCardConfig {
  id: string;
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  badge?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  className?: string;
}

export interface ConfigCardRendererProps {
  card: MetricCardConfig;
}

/**
 * ConfigCardRenderer
 *
 * Generic declarative KPI and metric tile renderer.
 * Formats values, trend indicators, badges, and icon slots adhering to DESIGN.md tokens.
 */
export function ConfigCardRenderer({ card }: ConfigCardRendererProps) {
  const IconComponent = card.icon;
  const isClickable = Boolean(card.onClick);

  return (
    <Card
      onClick={card.onClick}
      className={`border-border bg-surface transition-all ${
        isClickable ? "cursor-pointer hover:border-action/40 hover:shadow-sm" : ""
      } ${card.className || ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-text-secondary">
          {card.title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {card.badge && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {card.badge}
            </Badge>
          )}
          {IconComponent && (
            <div className="rounded-lg bg-surface-muted p-1.5 text-text-muted">
              <IconComponent className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="text-2xl font-bold tracking-tight text-text">
          {card.value}
        </div>

        {(card.description || card.trend) && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
            {card.trend && (
              <span
                className={`font-semibold ${
                  card.trend.positive ? "text-success" : "text-danger"
                }`}
              >
                {card.trend.value}
              </span>
            )}
            {card.description && <span>{card.description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
