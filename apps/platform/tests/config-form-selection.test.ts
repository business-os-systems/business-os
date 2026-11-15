import { describe, expect, it } from "vitest";
import { joinSelection, splitSelection } from "../src/components/forms/config-form-selection";

describe("multi-select encoding", () => {
  it("round-trips registry values", () => {
    const values = ["hospitality", "retail"];
    expect(splitSelection(joinSelection(values))).toEqual(values);
  });

  it("survives a value that contains a comma", () => {
    const values = ["a,b", "c"];
    expect(splitSelection(joinSelection(values))).toEqual(values);
  });

  it("treats an empty string as no selection", () => {
    expect(splitSelection("")).toEqual([]);
    expect(splitSelection("   ")).toEqual([]);
  });

  it("drops empty segments", () => {
    expect(splitSelection(joinSelection(["a"]) + "\u001f")).toEqual(["a"]);
  });
});
