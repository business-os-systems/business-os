"use client";

import { Input } from "@suite/ui";
import { DEFAULT_SWATCH_COLOR, isHexColour } from "@suite/website-builder/appearance";
import type { FieldControlChrome } from "./config-form.types";

export interface ColorFieldProps extends FieldControlChrome {
  readonly value: string;
  readonly presets: readonly string[];
  readonly onChange: (value: string) => void;
}

/** Colour is chosen, never typed blind: picker, presets and the resulting hex. */
export function ColorField(props: ColorFieldProps) {
  const swatchValue = isHexColour(props.value) ? props.value : DEFAULT_SWATCH_COLOR;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={"Colour picker for " + props.inputId}
          value={swatchValue}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value.toUpperCase())}
          className="h-8 w-10 cursor-pointer rounded-md border border-border bg-surface p-0.5"
        />
        <Input
          id={props.inputId}
          value={props.value}
          disabled={props.disabled}
          maxLength={7}
          aria-invalid={props.hasError ? true : undefined}
          aria-describedby={props.describedBy}
          onChange={(event) => props.onChange(event.target.value)}
          className="font-mono text-xs"
        />
      </div>
      {props.presets.length === 0 ? null : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour presets">
          {props.presets.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={props.disabled}
              aria-label={"Use " + preset}
              aria-pressed={props.value.toUpperCase() === preset.toUpperCase()}
              onClick={() => props.onChange(preset)}
              className="h-5 w-5 rounded-full border border-border"
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
