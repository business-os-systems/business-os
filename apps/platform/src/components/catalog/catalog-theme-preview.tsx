import { cn } from "@suite/ui";

interface CatalogThemePreviewProps {
  readonly tokens: Readonly<Record<string, string | number>>;
}

function isColourValue(value: string): boolean {
  return (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("oklch")
  );
}

/**
 * The theme payload is a token map, and the production renderer has no theme
 * provider yet (T115). The preview therefore renders the actual token payload
 * rather than inventing sample content.
 */
export function CatalogThemePreview({ tokens }: CatalogThemePreviewProps) {
  return (
    <div className="space-y-2 p-6">
      {Object.entries(tokens).map(([token, value]) => (
        <div
          key={token}
          className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-3 py-2"
        >
          <span className="font-mono text-xs text-text">{token}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-secondary">{String(value)}</span>
            {typeof value === "string" && isColourValue(value) ? (
              <span
                aria-hidden="true"
                className={cn("h-5 w-5 rounded border border-border")}
                style={{ backgroundColor: value }}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
