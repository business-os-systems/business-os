"use client";

import { lengthLabel } from "@suite/website-builder/appearance";
import { ColorField } from "./color-field";
import { MultiSelectField } from "./multi-select-field";
import { ScaleField } from "./scale-field";
import { joinSelection, splitSelection } from "./config-form-selection";
import type {
  ColorConfigFormField,
  FieldControlChrome,
  MultiSelectConfigFormField,
  ScaleConfigFormField,
} from "./config-form.types";

type GuidedField<T extends object> =
  | ColorConfigFormField<T>
  | ScaleConfigFormField<T>
  | MultiSelectConfigFormField<T>;

export interface GuidedFieldControlProps<T extends object> extends FieldControlChrome {
  readonly field: GuidedField<T>;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The three registry-driven controls share one dispatch so the renderer stays flat. */
export function GuidedFieldControl<T extends object>(props: GuidedFieldControlProps<T>) {
  const chrome: FieldControlChrome = {
    inputId: props.inputId,
    labelId: props.labelId,
    disabled: props.disabled,
    hasError: props.hasError,
    describedBy: props.describedBy,
  };
  const { field, onChange } = props;
  switch (field.type) {
    case "color":
      return <ColorField {...chrome} value={props.value} presets={field.presets} onChange={onChange} />;
    case "scale":
      return (
        <ScaleField
          {...chrome}
          value={props.value}
          steps={field.steps}
          allowCustom={field.allowCustom}
          labelOf={lengthLabel}
          onChange={onChange}
        />
      );
    case "multi-select":
      return (
        <MultiSelectField
          {...chrome}
          values={splitSelection(props.value)}
          options={field.options}
          searchable={field.searchable}
          onChange={(next) => onChange(joinSelection(next))}
        />
      );
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}
