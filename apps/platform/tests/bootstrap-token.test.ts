import { describe, expect, it } from "vitest";
import {
  clearBootstrapFragment,
  readBootstrapToken,
} from "../src/lib/bootstrap-token.js";

describe("bootstrap token in the address bar", () => {
  it("reads the token from the URL fragment", () => {
    expect(readBootstrapToken("#bootstrap=token-123")).toBe("token-123");
  });

  it("returns null for a fragment without a token", () => {
    expect(readBootstrapToken("#section")).toBeNull();
  });

  it("replaces the history entry with the bare path", () => {
    const calls: Array<readonly unknown[]> = [];
    const history = {
      replaceState: (...args: readonly unknown[]) => {
        calls.push(args);
      },
    };

    clearBootstrapFragment(history, "/sign-in", "");

    expect(calls).toEqual([[null, "", "/sign-in"]]);
  });
});
