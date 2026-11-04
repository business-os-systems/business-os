import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeBootstrapFailure,
  writeBootstrapLink,
} from "../scripts/bootstrap-link.js";

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "bootstrap-link-"));
}

describe("bootstrap link file", () => {
  it("writes the link with owner-only permissions", () => {
    const destination = join(temporaryDirectory(), "link.txt");

    writeBootstrapLink(
      destination,
      "http://localhost:3002/sign-in#bootstrap=abc"
    );

    expect(readFileSync(destination, "utf8")).toContain("bootstrap=abc");
    expect(statSync(destination).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing file", () => {
    const destination = join(temporaryDirectory(), "link.txt");
    writeFileSync(destination, "operator-authored content");

    expect(() => writeBootstrapLink(destination, "http://example.test")).toThrow(
      /remove the existing link file/i
    );
    expect(readFileSync(destination, "utf8")).toBe("operator-authored content");
  });

  it("refuses a symlinked destination", () => {
    const directory = temporaryDirectory();
    const target = join(directory, "target.txt");
    const link = join(directory, "link.txt");
    writeFileSync(target, "original");
    symlinkSync(target, link);

    expect(() => writeBootstrapLink(link, "http://example.test")).toThrow();
    expect(readFileSync(target, "utf8")).toBe("original");
  });

  it("refuses a destination reached through a symlinked directory", () => {
    const directory = temporaryDirectory();
    const realParent = join(directory, "real");
    const aliasParent = join(directory, "alias");
    mkdirSync(realParent);
    symlinkSync(realParent, aliasParent);

    expect(() =>
      writeBootstrapLink(join(aliasParent, "link.txt"), "http://example.test")
    ).toThrow(/symbolic link/i);
  });
});

describe("bootstrap failure message", () => {
  it("scrubs a database URL and an email from the printed error", () => {
    const message = describeBootstrapFailure(
      new Error(
        "connect failed for postgresql://admin:supersecret@localhost:5432/db (ops@example.com)"
      )
    );

    expect(message).not.toContain("supersecret");
    expect(message).not.toContain("ops@example.com");
  });

  it("scrubs the single-use bootstrap token", () => {
    const message = describeBootstrapFailure(
      new Error("could not open http://localhost:3002/sign-in#bootstrap=live-token-123")
    );

    expect(message).not.toContain("live-token-123");
  });
});
