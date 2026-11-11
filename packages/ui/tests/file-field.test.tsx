// @vitest-environment jsdom
/* global document, HTMLDivElement, HTMLInputElement */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileField } from "../src/components/file-field.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

it("exposes a labelled file input and reports the chosen file", async () => {
  const onChange = vi.fn();
  await act(async () => {
    root.render(
      <FileField
        id="upload"
        label="Image file"
        accept="image/png"
        actionLabel="Choose image"
        hint="Accepted types: image/png."
        onChange={onChange}
      />
    );
  });

  const input = container.querySelector<HTMLInputElement>("input[type=file]");
  const label = container.querySelector("label");
  if (input === null) throw new Error("File input missing.");
  expect(label?.textContent).toContain("Image file");
  expect(label?.textContent).toContain("Choose image");
  expect(label?.getAttribute("for")).toBe("upload");
  expect(input.className).toContain("sr-only");

  const file = new File(["hello"], "hero.png", { type: "image/png" });
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith(file);
});
