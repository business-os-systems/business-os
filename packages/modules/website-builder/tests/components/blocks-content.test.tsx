// @vitest-environment jsdom
/* global document, Event, HTMLDivElement */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  FaqBlock,
  FeaturesBlock,
  FooterBlock,
  FormBlock,
  HeroBlock,
  NavbarBlock,
  PricingBlock,
} from "../../src/components/blocks/index.js";
import type { MediaAssetMap } from "../../src/ast/types.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const LOGO_ASSET_ID = "ma_logo";
const MEDIA: MediaAssetMap = {
  [LOGO_ASSET_ID]: {
    assetId: LOGO_ASSET_ID,
    url: "https://cdn.example.com/media/logo.png",
    fileName: "logo.png",
    width: 120,
    height: 40,
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

async function renderElement(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

async function submitForm(): Promise<void> {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("Navigation and hero block content", () => {
  it("renders a navbar logo image, links and call to action", async () => {
    await renderElement(
      <NavbarBlock
        media={MEDIA}
        props={{
          logo: { kind: "asset", assetId: LOGO_ASSET_ID },
          logoText: "Alpine Lodge",
          items: [{ id: "n1", label: "Rooms", target: { url: "/rooms" } }],
          ctaButton: { label: "Book", target: { url: "/book" } },
        }}
      />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/media/logo.png"
    );
    expect(container.textContent).toContain("Alpine Lodge");
    expect(container.textContent).toContain("Rooms");
    expect(container.textContent).toContain("Book");
  });

  it("renders a navbar without a brand mark when none is configured", async () => {
    await renderElement(
      <NavbarBlock
        props={{ items: [{ id: "n1", label: "Rooms", target: { url: "/rooms" } }] }}
      />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Rooms");
  });

  it("renders a centred hero with badge, image and both call to actions", async () => {
    await renderElement(
      <HeroBlock
        media={MEDIA}
        styles={{ textAlign: "center" }}
        props={{
          badge: "New",
          headline: "Harbour views",
          subheadline: "Wake up beside the water.",
          image: { kind: "asset", assetId: LOGO_ASSET_ID },
          primaryCta: { label: "Book", target: { url: "/book" } },
          secondaryCta: { label: "Rooms", target: { url: "/rooms" } },
        }}
      />
    );

    expect(container.textContent).toContain("New");
    expect(container.textContent).toContain("Wake up beside the water.");
    expect(container.textContent).toContain("Rooms");
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("section > div")?.className).toContain("text-center");
  });
});

describe("Feature and footer block content", () => {
  it("renders feature cards with a subheadline and a learn-more link", async () => {
    await renderElement(
      <FeaturesBlock
        props={{
          subheadline: "Everything included.",
          columns: 2,
          features: [
            {
              id: "f1",
              title: "Pool",
              description: "Heated all year.",
              link: { url: "/amenities" },
            },
          ],
        }}
      />
    );

    expect(container.textContent).toContain("Everything included.");
    expect(container.textContent).toContain("Learn more");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/amenities");
  });

  it("renders no heading region when a feature grid has no copy", async () => {
    await renderElement(
      <FeaturesBlock
        props={{ features: [{ id: "f1", title: "Pool", description: "Heated all year." }] }}
      />
    );

    expect(container.querySelector("h2")).toBeNull();
    expect(container.textContent).toContain("Pool");
  });

  it("renders a footer logo image and its link columns", async () => {
    await renderElement(
      <FooterBlock
        media={MEDIA}
        props={{
          logo: { kind: "asset", assetId: LOGO_ASSET_ID },
          logoText: "Alpine Lodge",
          copyrightText: "© 2026 Alpine Lodge",
          columns: [
            {
              id: "c1",
              title: "Legal",
              links: [{ id: "l1", label: "Terms", target: { url: "/terms" } }],
            },
          ],
        }}
      />
    );

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.textContent).toContain("Legal");
    expect(container.textContent).toContain("Terms");
  });
});

describe("Pricing block content", () => {
  it("renders a tier with description, badge and included and excluded features", async () => {
    await renderElement(
      <PricingBlock
        props={{
          subheadline: "Choose a plan.",
          tiers: [
            {
              id: "t1",
              name: "Suite",
              description: "The full experience.",
              priceAmount: 180,
              currency: "USD",
              interval: "month",
              isFeatured: true,
              badge: "Popular",
              cta: { label: "Book", target: { url: "/book" } },
              features: [
                { text: "Breakfast", included: true },
                { text: "Spa", included: false },
              ],
            },
          ],
        }}
      />
    );

    expect(container.textContent).toContain("Choose a plan.");
    expect(container.textContent).toContain("The full experience.");
    expect(container.textContent).toContain("Popular");
    expect(container.textContent).toContain("Breakfast");
    expect(container.textContent).toContain("Spa");
  });
});

describe("Form block submission states", () => {
  const FORM_PROPS = {
    subheadline: "We reply within one day.",
    formId: "form_contact",
    submitButtonText: "Send",
    fields: [
      {
        id: "field_name",
        name: "fullName",
        label: "Full name",
        type: "text" as const,
        required: true,
      },
      {
        id: "field_notes",
        name: "notes",
        label: "Notes",
        type: "textarea" as const,
      },
    ],
  };

  it("renders the success state after the configured handler accepts", async () => {
    const onSubmit = vi.fn(() => Promise.resolve(true));
    await renderElement(<FormBlock props={FORM_PROPS} onSubmit={onSubmit} />);

    expect(container.textContent).toContain("*");
    await submitForm();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Thank you!");
  });

  it("renders the configured error message when the handler rejects the values", async () => {
    await renderElement(
      <FormBlock
        props={{ ...FORM_PROPS, errorMessage: "Please check your details." }}
        onSubmit={() => Promise.resolve(false)}
      />
    );

    await submitForm();

    expect(container.textContent).toContain("Please check your details.");
  });

  it("renders the configured error message when the handler throws", async () => {
    await renderElement(
      <FormBlock
        props={{ ...FORM_PROPS, errorMessage: "Try again shortly." }}
        onSubmit={() => Promise.reject(new Error("upstream unavailable"))}
      />
    );

    await submitForm();

    expect(container.textContent).toContain("Try again shortly.");
  });

  it("treats a form without a submit handler as accepted", async () => {
    await renderElement(<FormBlock props={FORM_PROPS} />);

    await submitForm();

    expect(container.textContent).toContain("Thank you!");
  });
});

describe("FAQ block interaction", () => {
  it("reveals an answer when its question is selected", async () => {
    await renderElement(
      <FaqBlock
        props={{
          subheadline: "Common questions",
          items: [{ id: "q1", question: "Pets allowed?", answer: "Yes, on request." }],
        }}
      />
    );

    expect(container.textContent).not.toContain("Yes, on request.");

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(container.textContent).toContain("Yes, on request.");
  });
});
