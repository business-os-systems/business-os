import React from "react";
import { Button, Badge } from "@suite/ui";
import { ArrowRightIcon } from "@suite/ui/icons";
import type { HeroBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface HeroBlockComponentProps {
  props: HeroBlockProps;
  styles?: BlockStyleTokens;
}

const TEXT_ALIGN_MAP: Record<string, string> = {
  center: "text-center items-center",
  right: "text-right items-end",
  left: "text-left items-start",
};

export function HeroBlock({ props, styles }: HeroBlockComponentProps) {
  const textAlignClass = TEXT_ALIGN_MAP[styles?.textAlign || "left"] || TEXT_ALIGN_MAP["left"];

  const paddingStyle: React.CSSProperties = {
    paddingTop: styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "64px",
    paddingBottom: styles?.paddingBottom !== undefined ? `${styles.paddingBottom}px` : "64px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  return (
    <section
      data-block-type="hero"
      style={paddingStyle}
      className={`w-full flex flex-col justify-center px-4 sm:px-6 lg:px-8 ${styles?.customClassName || ""}`}
    >
      <div className={`max-w-5xl mx-auto w-full flex flex-col ${textAlignClass}`}>
        {props.badge ? (
          <Badge variant="secondary" className="mb-4">
            {props.badge}
          </Badge>
        ) : null}

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
          {props.headline}
        </h1>

        {props.subheadline ? (
          <p className="mt-4 text-lg sm:text-xl text-slate-600 max-w-2xl">
            {props.subheadline}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4 items-center">
          {props.primaryCta ? (
            <a href={props.primaryCta.target.url}>
              <Button size="lg" className="gap-2">
                {props.primaryCta.label}
                <ArrowRightIcon size={18} />
              </Button>
            </a>
          ) : null}

          {props.secondaryCta ? (
            <a href={props.secondaryCta.target.url}>
              <Button variant="outline" size="lg">
                {props.secondaryCta.label}
              </Button>
            </a>
          ) : null}
        </div>

        {props.imageUrl ? (
          <div className="mt-12 w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
            <img
              src={props.imageUrl}
              alt={props.imageAlt || props.headline}
              className="w-full h-auto object-cover max-h-[500px]"
              loading="lazy"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
