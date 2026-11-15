"use client";

import { useMemo, useState } from "react";
import { Input } from "@suite/ui";
import type { FieldControlChrome } from "./config-form.types";
import type { ConfigFormOption } from "./config-form.types";

export interface MultiSelectFieldProps extends FieldControlChrome {
  readonly values: readonly string[];
  readonly options: readonly ConfigFormOption[];
  readonly searchable: boolean;
  readonly onChange: (values: readonly string[]) => void;
}

interface SelectionProps {
  readonly options: readonly ConfigFormOption[];
  readonly selected: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onToggle: (value: string) => void;
}

interface OptionsProps extends SelectionProps {
  readonly visible: readonly ConfigFormOption[];
}

function labelFor(options: readonly ConfigFormOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function SelectedChips(props: SelectionProps & { readonly values: readonly string[] }) {
  if (props.values.length === 0) {
    return <p className="text-xs text-text-muted">Nothing selected.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.values.map((value) => (
        <button
          key={value}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onToggle(value)}
          className="rounded-full border border-brand/30 bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand"
        >
          {labelFor(props.options, value)} ✕
        </button>
      ))}
    </div>
  );
}

function OptionRows(props: OptionsProps) {
  return (
    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
      {props.visible.length === 0 ? (
        <p className="px-1 py-1 text-xs text-text-muted">No match.</p>
      ) : (
        props.visible.map((option) => {
          const isOn = props.selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={props.disabled}
              aria-pressed={isOn}
              onClick={() => props.onToggle(option.value)}
              className={
                isOn
                  ? "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-semibold text-brand"
                  : "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-text-secondary"
              }
            >
              <span>{option.label}</span>
              <span aria-hidden="true">{isOn ? "✓" : "+"}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

/** Registry values are selected, never typed: search, then toggle. */
export function MultiSelectField(props: MultiSelectFieldProps) {
  const [query, setQuery] = useState("");
  const selected = new Set(props.values);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return props.options;
    }
    return props.options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
    );
  }, [props.options, query]);

  function toggle(value: string): void {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    props.onChange([...next]);
  }

  return (
    <div
      role="group"
      aria-labelledby={props.labelId}
      aria-describedby={props.describedBy}
      className="space-y-2"
    >
      {props.searchable ? (
        <Input
          aria-label="Search options"
          value={query}
          disabled={props.disabled}
          placeholder="Search…"
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <SelectedChips
        values={props.values}
        options={props.options}
        selected={selected}
        disabled={props.disabled}
        onToggle={toggle}
      />
      <OptionRows
        visible={visible}
        options={props.options}
        selected={selected}
        disabled={props.disabled}
        onToggle={toggle}
      />
    </div>
  );
}
