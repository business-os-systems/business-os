"use client";

import { Input, Select } from "@suite/ui";
import type { LengthUnit } from "@suite/website-builder/appearance";
import { LENGTH_UNITS, joinLength, splitLength } from "@suite/website-builder/appearance";
import type { FieldControlChrome } from "./config-form.types";

interface CustomLengthProps {
  readonly amount: string;
  readonly unit: LengthUnit;
  readonly disabled: boolean;
  readonly hasError: boolean;
  readonly describedBy: string | undefined;
  readonly onAmount: (amount: string) => void;
  readonly onUnit: (unit: string) => void;
}

function CustomLengthControl(props: CustomLengthProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Custom value"
        inputMode="decimal"
        value={props.amount}
        disabled={props.disabled}
        placeholder="2.75"
        aria-invalid={props.hasError ? true : undefined}
        aria-describedby={props.describedBy}
        onChange={(event) => props.onAmount(event.target.value)}
      />
      <Select
        aria-label="Unit"
        value={props.unit}
        options={LENGTH_UNITS.map((entry) => ({ value: entry, label: entry }))}
        disabled={props.disabled}
        onChange={props.onUnit}
        className="w-24"
      />
    </div>
  );
}

export interface ScaleFieldProps extends FieldControlChrome {
  readonly value: string;
  readonly steps: readonly string[];
  readonly allowCustom: boolean;
  readonly labelOf: (value: string) => string;
  readonly onChange: (value: string) => void;
}

const CUSTOM = "__custom__";

/** A declared step by default; a number plus its unit when Custom is chosen. */
export function ScaleField(props: ScaleFieldProps) {
  const isStep = props.steps.includes(props.value);
  const parsed = splitLength(props.value);
  const amount = parsed === null ? "" : parsed.amount;
  const unit = parsed === null ? "rem" : parsed.unit;

  const stepOptions = props.steps.map((step) => ({ value: step, label: props.labelOf(step) }));
  const options = props.allowCustom
    ? [...stepOptions, { value: CUSTOM, label: "Custom value" }]
    : stepOptions;

  function select(next: string): void {
    if (next === CUSTOM) {
      props.onChange("");
      return;
    }
    props.onChange(next);
  }

  function setAmount(next: string): void {
    props.onChange(joinLength(next, unit));
  }

  function setUnit(next: string): void {
    if (next === "rem" || next === "px" || next === "em") {
      props.onChange(joinLength(amount, next));
    }
  }

  return (
    <div className="space-y-1.5">
      <Select
        id={props.inputId}
        value={isStep ? props.value : CUSTOM}
        options={options}
        disabled={props.disabled}
        hasError={props.hasError}
        aria-invalid={props.hasError ? true : undefined}
        aria-describedby={props.describedBy}
        onChange={select}
      />
      {isStep ? null : (
        <CustomLengthControl
          amount={amount}
          unit={unit}
          disabled={props.disabled}
          hasError={props.hasError}
          describedBy={props.describedBy}
          onAmount={setAmount}
          onUnit={setUnit}
        />
      )}
    </div>
  );
}
