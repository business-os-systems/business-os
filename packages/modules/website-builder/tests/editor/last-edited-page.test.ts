import { describe, expect, it } from "vitest";
import {
  forgetLastEditedPage,
  lastEditedPageStorageKey,
  readLastEditedPage,
  recordLastEditedPage,
  type EditorContextStorage,
} from "../../src/editor/context/index.js";

const SCOPE = { organizationId: "org_1", userId: "usr_1", siteId: "site_1" };

function memoryStorage(): EditorContextStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("Last-edited page context (FR-079, FR-084)", () => {
  it("keys the context by organization, user and site", () => {
    expect(lastEditedPageStorageKey(SCOPE)).toBe(
      "website-builder:last-page:org_1:usr_1:site_1"
    );
    expect(
      lastEditedPageStorageKey({ ...SCOPE, siteId: "site_2" })
    ).not.toBe(lastEditedPageStorageKey(SCOPE));
  });

  it("records, reads and forgets the page", () => {
    const storage = memoryStorage();
    expect(readLastEditedPage(SCOPE, storage)).toBeNull();
    recordLastEditedPage(SCOPE, "page_menu", storage);
    expect(readLastEditedPage(SCOPE, storage)).toBe("page_menu");
    forgetLastEditedPage(SCOPE, storage);
    expect(readLastEditedPage(SCOPE, storage)).toBeNull();
  });

  it("rejects malformed stored values and page ids", () => {
    const storage = memoryStorage();
    storage.setItem(lastEditedPageStorageKey(SCOPE), "../escape");
    expect(readLastEditedPage(SCOPE, storage)).toBeNull();
    recordLastEditedPage(SCOPE, "not a page id", storage);
    expect(readLastEditedPage(SCOPE, storage)).toBeNull();
  });
});
