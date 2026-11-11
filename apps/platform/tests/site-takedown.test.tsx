// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { STEP_UP_TOKEN_HEADER } from "@suite/core";
import { IDEMPOTENCY_HEADER } from "../src/lib/api";
import type { TenantSite } from "../src/lib/site-takedown-api";
import {
  SITE_CONFIRM_MISMATCH_MESSAGE,
  canRestoreSite,
  canSuspendSite,
  validateSiteTakedownForm,
} from "../src/components/forms/site-takedown-form.config";
import { TenantSitesPanel } from "../src/app/(platform)/tenants/[orgId]/danger/tenant-sites-panel";

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: () => ({
    id: "credential-1",
    rawId: "credential-1",
    type: "public-key",
    response: {
      clientDataJSON: "client",
      authenticatorData: "auth",
      signature: "signature",
      userHandle: null,
    },
    clientExtensionResults: {},
    authenticatorAttachment: "platform",
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUSPEND_CONFIRM = "Confirm suspension";

const SITE: TenantSite = {
  id: "site_1",
  title: "River View",
  slug: "river-view",
  status: "PUBLISHED",
  hostnames: ["river-view.business-os.site"],
  updatedAt: "2026-11-11T00:00:00.000Z",
};

const OPTIONS = {
  challenge: "challenge-1",
  rpId: "localhost",
  allowCredentials: [],
  timeout: 60_000,
  userVerification: "preferred",
};

const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function render(ui: ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent.trim() === label
  );
  if (found === undefined) throw new Error("Missing button " + label);
  return found;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element) as object,
    "value"
  )?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function success(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      requestId: "req-1",
      timestamp: "2026-11-11T00:00:00.000Z",
      data,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function installFetch(sites: readonly TenantSite[]): void {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/sites")) return success({ items: sites });
    if (url.endsWith("/auth/sign-in/options")) return success({ flowId: "flow-1", options: OPTIONS });
    if (url.endsWith("/auth/step-up/verify")) {
      return success({ token: "step-up-token-1", expiresAt: "2026-11-11T00:05:00.000Z" });
    }
    if (url.endsWith("/suspend") || url.endsWith("/restore")) {
      return success({
        siteId: "site_1",
        fromStatus: url.endsWith("/suspend") ? "PUBLISHED" : "SUSPENDED",
        toStatus: url.endsWith("/suspend") ? "SUSPENDED" : "PUBLISHED",
        occurredAt: "2026-11-11T00:00:00.000Z",
        hostnames: ["river-view.business-os.site"],
      });
    }
    throw new Error("Unexpected fetch " + url);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountPanel(sites: readonly TenantSite[], onApplied = vi.fn()): Promise<void> {
  installFetch(sites);
  render(<TenantSitesPanel organizationId="org_1" onApplied={onApplied} />);
  await flush();
}

function fillModal(reason: string, slug: string): void {
  const reasonField = document.querySelector("textarea");
  const slugField = document.querySelector("input");
  if (reasonField === null || slugField === null) throw new Error("Fields missing");
  act(() => {
    setValue(reasonField, reason);
    setValue(slugField, slug);
  });
}

async function confirm(label: string): Promise<void> {
  act(() => button(label).click());
  await flush();
}

function requestBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") throw new Error("Expected a JSON string body");
  return JSON.parse(init.body) as Record<string, unknown>;
}

function postInit(suffix: string): RequestInit {
  const post = fetchMock.mock.calls.find((call) => String(call[0]).endsWith(suffix));
  if (post === undefined) throw new Error("No request for " + suffix);
  return post[1] as RequestInit;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Site takedown config", () => {
  it("offers only the transition the current status allows", () => {
    expect(canSuspendSite("PUBLISHED")).toBe(true);
    expect(canSuspendSite("MAINTENANCE")).toBe(true);
    expect(canSuspendSite("SUSPENDED")).toBe(false);
    expect(canRestoreSite("SUSPENDED")).toBe(true);
    expect(canRestoreSite("PUBLISHED")).toBe(false);
  });

  it("requires a reason and the exact site slug", () => {
    expect(
      validateSiteTakedownForm({ values: { reason: " ", confirmSite: "" }, slug: SITE.slug })
        .confirmSite
    ).toBeDefined();
    expect(
      validateSiteTakedownForm({
        values: { reason: "Reported phishing", confirmSite: "other" },
        slug: SITE.slug,
      }).confirmSite
    ).toBe(SITE_CONFIRM_MISMATCH_MESSAGE);
    expect(
      validateSiteTakedownForm({
        values: { reason: "Reported phishing", confirmSite: SITE.slug },
        slug: SITE.slug,
      })
    ).toEqual({});
  });
});

it("suspends only after a typed confirmation and a fresh step-up token", async () => {
  const onApplied = vi.fn();
  await mountPanel([SITE], onApplied);
  expect(document.body.textContent).toContain("River View");
  expect(document.body.textContent).toContain("river-view.business-os.site");
  act(() => button("Suspend site").click());

  expect(document.body.textContent).toContain("Type river-view to confirm");
  expect(button(SUSPEND_CONFIRM).disabled).toBe(true);
  fillModal("Reported phishing after verification", "wrong");
  expect(button(SUSPEND_CONFIRM).disabled).toBe(true);
  fillModal("Reported phishing after verification", SITE.slug);
  expect(button(SUSPEND_CONFIRM).disabled).toBe(false);

  await confirm(SUSPEND_CONFIRM);
  const init = postInit("/suspend");
  expect((init.headers as Record<string, string>)[STEP_UP_TOKEN_HEADER]).toBe(
    "step-up-token-1"
  );
  expect((init.headers as Record<string, string>)[IDEMPOTENCY_HEADER]).toMatch(
    /^[0-9a-f-]{36}$/
  );
  expect(requestBody(init)).toEqual({
    reason: "Reported phishing after verification",
    expectedStatus: "PUBLISHED",
  });
  expect(onApplied).toHaveBeenCalledWith(
    "Site suspended. Its hosts now return a holding response."
  );
});

it("restores a suspended site through the restore endpoint", async () => {
  await mountPanel([{ ...SITE, status: "SUSPENDED" }]);
  act(() => button("Restore site").click());
  fillModal("Review cleared the report", SITE.slug);
  await confirm("Confirm restore");
  expect(requestBody(postInit("/restore"))).toMatchObject({ expectedStatus: "SUSPENDED" });
});
