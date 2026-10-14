import React from "react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@suite/ui";
import { CheckIcon } from "@suite/ui/icons";
import type { PricingBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface PricingBlockComponentProps {
  props: PricingBlockProps;
  styles?: BlockStyleTokens;
}

export function PricingBlock({ props, styles }: PricingBlockComponentProps) {
  const paddingStyle: React.CSSProperties = {
    paddingTop:
      styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "64px",
    paddingBottom:
      styles?.paddingBottom !== undefined
        ? `${styles.paddingBottom}px`
        : "64px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  return (
    <section
      data-block-type="pricing"
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName ?? ""}`}
    >
      <div className="max-w-6xl mx-auto">
        {props.headline || props.subheadline ? (
          <div className="text-center max-w-3xl mx-auto mb-12">
            {props.headline ? (
              <h2 className="text-3xl font-bold font-heading tracking-tight text-on-surface sm:text-4xl">
                {props.headline}
              </h2>
            ) : null}
            {props.subheadline ? (
              <p className="mt-4 text-lg text-on-surface-variant">
                {props.subheadline}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {(props.tiers || []).map((tier) => (
            <Card
              key={tier.id}
              className={`flex flex-col justify-between ${
                tier.isFeatured
                  ? "border-2 border-primary shadow-xl relative"
                  : "border border-hairline"
              }`}
            >
              <CardHeader>
                {tier.badge ? (
                  <Badge
                    variant={tier.isFeatured ? "default" : "secondary"}
                    className="w-fit mb-2"
                  >
                    {tier.badge}
                  </Badge>
                ) : null}
                <CardTitle className="text-2xl font-heading">
                  {tier.name}
                </CardTitle>
                {tier.description ? (
                  <p className="text-sm text-on-surface-variant mt-1">
                    {tier.description}
                  </p>
                ) : null}
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-on-surface">
                    {`${tier.currency} ${tier.priceAmount}`}
                  </span>
                  <span className="ml-1 text-sm text-on-surface-variant">
                    {`/${tier.interval}`}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3 mt-4">
                  {tier.features.map((feat, idx) => (
                    <li
                      key={idx}
                      className="flex items-center text-sm text-on-surface"
                    >
                      <span
                        className={`mr-3 inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          feat.included
                            ? "bg-secondary-container text-on-secondary-container"
                            : "bg-surface-container text-outline opacity-50"
                        }`}
                      >
                        <CheckIcon size={14} />
                      </span>
                      <span
                        className={
                          feat.included ? "" : "line-through text-outline"
                        }
                      >
                        {feat.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-4">
                <a href={tier.cta.target.url} className="w-full">
                  <Button
                    variant={tier.isFeatured ? "default" : "outline"}
                    className="w-full"
                    size="lg"
                  >
                    {tier.cta.label}
                  </Button>
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
