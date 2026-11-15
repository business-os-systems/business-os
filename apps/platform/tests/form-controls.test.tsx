// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_SWATCH_COLOR } from "@suite/website-builder/appearance";
import { ColorField } from "../src/components/forms/color-field";
import { ScaleField } from "../src/components/forms/scale-field";
import { MultiSelectField } from "../src/components/forms/multi-select-field";
import { GuidedFieldControl } from "../src/components/forms/guided-field-control";
import { PlainFieldControl } from "../src/components/forms/plain-field-control";
import { ConfigFormRenderer } from "../src/components/forms/config-form-renderer";
import type { ConfigFormField, FieldControlChrome } from "../src/components/forms/config-form.types";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BRAND_HEX = "#1F5A44";
const COLOR_PICKER = 'input[type="color"]';

const chrome: FieldControlChrome = {
  inputId: "field-1",
  labelId: "field-1-label",
  disabled: false,
  hasError: false,
  describedBy: undefined,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

function click(element: Element | null): void {
  if (element === null) {
    throw new Error("Expected an element to click");
  }
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (element === null) {
    throw new Error("Expected an input");
  }
  const node = element;
  const proto =
    node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  /* eslint-disable-next-line @typescript-eslint/unbound-method -- a DOM value setter must be applied with Reflect.apply so React's value tracker sees the change */
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter === undefined) {
    throw new Error("No value setter on this element");
  }
  Reflect.apply(setter, node, [value]);
  act(() => {
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function selectTriggers(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]')];
}

function choose(scope: HTMLElement, label: string): void {
  click(selectTriggers(scope)[0] ?? null);
  const option = [...scope.querySelectorAll('[role="option"]')].find((node) =>
    node.textContent.includes(label)
  );
  click(option ?? null);
}

describe("ColorField", () => {
  it("renders the colour and applies a preset", () => {
    const onChange = vi.fn();
    render(<ColorField {...chrome} value={BRAND_HEX} presets={["#FFFFFF"]} onChange={onChange} />);
    expect(container.querySelector<HTMLInputElement>("#field-1")?.value).toBe(BRAND_HEX);
    click(container.querySelector('[aria-label="Use #FFFFFF"]'));
    expect(onChange).toHaveBeenCalledWith("#FFFFFF");
  });

  it("falls back to the contract swatch when the value is not hex", () => {
    render(<ColorField {...chrome} value="red" presets={[]} onChange={() => undefined} />);
    const picker = container.querySelector<HTMLInputElement>(COLOR_PICKER);
    expect(picker?.value.toLowerCase()).toBe(DEFAULT_SWATCH_COLOR.toLowerCase());
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it("reports a typed hex and a picker change", () => {
    const onChange = vi.fn();
    render(<ColorField {...chrome} value={BRAND_HEX} presets={[]} onChange={onChange} />);
    type(container.querySelector<HTMLInputElement>("#field-1"), "#AABBCC");
    expect(onChange).toHaveBeenCalledWith("#AABBCC");
    const picker = container.querySelector<HTMLInputElement>(COLOR_PICKER);
    if (picker !== null) {
      type(picker, "#112233");
    }
    expect(onChange).toHaveBeenCalledWith("#112233".toUpperCase());
  });
});

describe("ScaleField", () => {
  const steps = ["1rem", "2.5rem"];

  it("renders a declared step without the custom input", () => {
    const onChange = vi.fn();
    render(
      <ScaleField {...chrome} value="2.5rem" steps={steps} allowCustom labelOf={(value) => value} onChange={onChange} />
    );
    expect(container.textContent).toContain("2.5rem");
    expect(container.querySelector('[aria-label="Custom value"]')).toBeNull();
  });

  it("switches to custom and keeps the unit with the number", () => {
    const onChange = vi.fn();
    render(<ScaleField {...chrome} value="2.5rem" steps={steps} allowCustom labelOf={(value) => value} onChange={onChange} />);
    choose(container, "Custom value");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("edits the amount and the unit of a custom value", () => {
    const onChange = vi.fn();
    render(<ScaleField {...chrome} value="2.75rem" steps={steps} allowCustom labelOf={(value) => value} onChange={onChange} />);
    type(container.querySelector<HTMLInputElement>('[aria-label="Custom value"]'), "3");
    expect(onChange).toHaveBeenCalledWith("3rem");
    click(selectTriggers(container)[1] ?? null);
    const px = [...container.querySelectorAll('[role="option"]')].find((node) => node.textContent === "px");
    click(px ?? null);
    expect(onChange).toHaveBeenCalledWith("2.75px");
  });

  it("handles a value with no parsable unit", () => {
    render(<ScaleField {...chrome} value="rem" steps={steps} allowCustom labelOf={(value) => value} onChange={() => undefined} />);
    expect(container.querySelector<HTMLInputElement>('[aria-label="Custom value"]')?.value).toBe("");
  });

  it("selects a declared step from the list", () => {
    const onChange = vi.fn();
    render(<ScaleField {...chrome} value="" steps={steps} allowCustom labelOf={(value) => value} onChange={onChange} />);
    choose(container, "1rem");
    expect(onChange).toHaveBeenCalledWith("1rem");
  });
});

describe("MultiSelectField", () => {
  const options = [
    { value: "hospitality", label: "Hospitality" },
    { value: "retail", label: "Retail" },
  ];

  it("shows chips, toggles an option and removes a chip", () => {
    const onChange = vi.fn();
    render(<MultiSelectField {...chrome} values={["retail"]} options={options} searchable onChange={onChange} />);
    click(container.querySelector('[aria-pressed="false"]'));
    expect(onChange).toHaveBeenCalledWith(["retail", "hospitality"]);
    click([...container.querySelectorAll("button")].find((node) => node.textContent.includes("Retail")) ?? null);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("filters options and reports no match", () => {
    render(<MultiSelectField {...chrome} values={[]} options={options} searchable onChange={() => undefined} />);
    expect(container.textContent).toContain("Nothing selected.");
    type(container.querySelector<HTMLInputElement>('[aria-label="Search options"]'), "zzz");
    expect(container.textContent).toContain("No match.");
  });

  it("works without search and without options", () => {
    render(<MultiSelectField {...chrome} values={[]} options={[]} searchable={false} onChange={() => undefined} />);
    expect(container.querySelector('[aria-label="Search options"]')).toBeNull();
    expect(container.textContent).toContain("No match.");
  });
});

describe("GuidedFieldControl", () => {
  it("renders the colour, scale and multi-select variants", () => {
    render(
      <GuidedFieldControl
        {...chrome}
        field={{ name: "a", label: "A", description: "", required: false, type: "color", presets: [] }}
        value={BRAND_HEX}
        onChange={() => undefined}
      />
    );
    expect(container.querySelector(COLOR_PICKER)).not.toBeNull();
    render(
      <GuidedFieldControl
        {...chrome}
        field={{ name: "b", label: "B", description: "", required: false, type: "scale", steps: ["1rem"], allowCustom: true }}
        value="1rem"
        onChange={() => undefined}
      />
    );
    expect(container.textContent).toContain("1rem");
    render(
      <GuidedFieldControl
        {...chrome}
        field={{ name: "c", label: "C", description: "", required: false, type: "multi-select", options: [{ value: "x", label: "X" }], searchable: false }}
        value="x"
        onChange={() => undefined}
      />
    );
    expect(container.textContent).toContain("X");
  });
});

describe("PlainFieldControl", () => {
  const base = { name: "plain", label: "Plain", description: "", required: false } as const;

  it("renders a select", () => {
    render(
      <PlainFieldControl
        {...chrome}
        field={{ ...base, type: "select", options: [{ value: "a", label: "A" }] }}
        value="a"
        onChange={() => undefined}
      />
    );
    expect(container.textContent).toContain("A");
  });

  it("renders a textarea", () => {
    const onChange = vi.fn();
    render(<PlainFieldControl {...chrome} field={{ ...base, type: "textarea", rows: 3 }} value="hello" onChange={onChange} />);
    type(container.querySelector("textarea"), "bye");
    expect(onChange).toHaveBeenCalledWith("bye");
  });

  it("renders a date and a text input", () => {
    render(<PlainFieldControl {...chrome} field={{ ...base, type: "datetime-local" }} value="" onChange={() => undefined} />);
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeNull();
    render(<PlainFieldControl {...chrome} field={{ ...base, type: "text", maxLength: 10 }} value="x" onChange={() => undefined} />);
    expect(container.querySelector<HTMLInputElement>("#field-1")?.maxLength).toBe(10);
  });
});

describe("ConfigFormRenderer guided wiring", () => {
  const fields: ConfigFormField<Record<string, string>>[] = [
    { name: "brand", label: "Brand", description: "", required: true, type: "color", presets: [] },
    { name: "size", label: "Size", description: "", required: false, type: "scale", steps: ["1rem"], allowCustom: true },
    { name: "regions", label: "Regions", description: "", required: false, type: "multi-select", options: [{ value: "eu", label: "EU" }], searchable: true },
    { name: "note", label: "Note", description: "", required: false, type: "text" },
  ];

  it("renders every guided control and labels the multi-select group", () => {
    render(
      <ConfigFormRenderer
        fields={fields}
        values={{ brand: BRAND_HEX, size: "1rem", regions: "eu", note: "hi" }}
        errors={{}}
        disabled={false}
        formId="catalog"
        onChange={() => undefined}
      />
    );
    expect(container.querySelector(COLOR_PICKER)).not.toBeNull();
    expect(container.textContent).toContain("EU");
    const labels = [...container.querySelectorAll("label")];
    const multiLabel = labels.find((node) => node.textContent.includes("Regions"));
    expect(multiLabel?.getAttribute("for")).toBeNull();
    expect(multiLabel?.id).toBe("catalog-regions-label");
  });
});
