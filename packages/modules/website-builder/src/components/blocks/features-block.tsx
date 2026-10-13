import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@suite/ui";
import { SparklesIcon, ArrowRightIcon } from "@suite/ui/icons";
import type { FeaturesBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface FeaturesBlockComponentProps {
  props: FeaturesBlockProps;
  styles?: BlockStyleTokens;
}

const GRID_COLUMNS_MAP: Record<number, string> = {
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

export function FeaturesBlock({ props, styles }: FeaturesBlockComponentProps) {
  const columns = props.columns || 3;
  const gridColsClass = GRID_COLUMNS_MAP[columns] ?? GRID_COLUMNS_MAP[3];

  const paddingStyle: React.CSSProperties = {
    paddingTop: styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "64px",
    paddingBottom: styles?.paddingBottom !== undefined ? `${styles.paddingBottom}px` : "64px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  return (
    <section
      data-block-type="features"
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName || ""}`}
    >
      <div className="max-w-6xl mx-auto">
        {props.headline || props.subheadline ? (
          <div className="text-center max-w-3xl mx-auto mb-12">
            {props.headline ? (
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {props.headline}
              </h2>
            ) : null}
            {props.subheadline ? (
              <p className="mt-4 text-lg text-slate-600">{props.subheadline}</p>
            ) : null}
          </div>
        ) : null}

        <div className={`grid gap-8 ${gridColsClass}`}>
          {props.features.map((feature) => (
            <Card key={feature.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900 mb-2">
                  <SparklesIcon size={20} />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {feature.description}
                </p>
                {feature.link ? (
                  <a
                    href={feature.link.url}
                    className="inline-flex items-center text-sm font-medium text-slate-900 hover:underline mt-4 gap-1"
                  >
                    Learn more <ArrowRightIcon size={14} />
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
