import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  HeroBlock,
  FeaturesBlock,
  PricingBlock,
  FormBlock,
  FaqBlock,
  RichTextBlock,
  NavbarBlock,
  FooterBlock,
} from "../../src/components/blocks/index.js";

describe("Core Block Component Catalog & UI Primitives", () => {
  it("renders HeroBlock with primary and secondary CTAs", () => {
    const html = renderToString(
      <HeroBlock
        props={{
          badge: "Boutique Stays",
          headline: "River View Alpine Retreat",
          subheadline: "Escape into tranquility overlooking pristine rivers.",
          primaryCta: {
            label: "Check Availability",
            target: { url: "/book" },
          },
          secondaryCta: {
            label: "View Rooms",
            target: { url: "/rooms" },
          },
        }}
      />
    );

    expect(html).toContain("Boutique Stays");
    expect(html).toContain("River View Alpine Retreat");
    expect(html).toContain("Check Availability");
    expect(html).toContain("View Rooms");
    expect(html).toContain("data-block-type=\"hero\"");
  });

  it("renders FeaturesBlock with grid cards", () => {
    const html = renderToString(
      <FeaturesBlock
        props={{
          headline: "Exclusive Amenities",
          columns: 3,
          features: [
            {
              id: "f1",
              title: "Infinity Pool",
              description: "Heated thermal pools with alpine vistas.",
            },
            {
              id: "f2",
              title: "Organic Dining",
              description: "Farm-to-table culinary experiences.",
            },
          ],
        }}
      />
    );

    expect(html).toContain("Exclusive Amenities");
    expect(html).toContain("Infinity Pool");
    expect(html).toContain("Organic Dining");
    expect(html).toContain("data-block-type=\"features\"");
  });

  it("renders PricingBlock with pricing tiers and feature checkmarks", () => {
    const html = renderToString(
      <PricingBlock
        props={{
          headline: "Simple Packages",
          tiers: [
            {
              id: "t1",
              name: "Standard Suite",
              priceAmount: 180,
              currency: "USD",
              interval: "month",
              isFeatured: true,
              badge: "Popular",
              cta: { label: "Book Now", target: { url: "/book" } },
              features: [{ text: "King Bed", included: true }],
            },
          ],
        }}
      />
    );

    expect(html).toContain("Standard Suite");
    expect(html).toContain("USD 180");
    expect(html).toContain("/month");
    expect(html).toContain("King Bed");
    expect(html).toContain("Popular");
    expect(html).toContain("data-block-type=\"pricing\"");
  });

  it("renders FormBlock with dynamic fields and submit button", () => {
    const html = renderToString(
      <FormBlock
        props={{
          headline: "Plan Your Event",
          formId: "form_123",
          submitButtonText: "Send Request",
          fields: [
            {
              id: "f_name",
              name: "fullName",
              label: "Your Full Name",
              type: "text",
              required: true,
            },
            {
              id: "f_msg",
              name: "notes",
              label: "Special Requests",
              type: "textarea",
            },
          ],
        }}
      />
    );

    expect(html).toContain("Plan Your Event");
    expect(html).toContain("Your Full Name");
    expect(html).toContain("Special Requests");
    expect(html).toContain("Send Request");
    expect(html).toContain("data-block-type=\"form\"");
  });

  it("renders FaqBlock with questions and answers", () => {
    const html = renderToString(
      <FaqBlock
        props={{
          headline: "Frequently Asked Questions",
          items: [
            {
              id: "q1",
              question: "What is check-in time?",
              answer: "Check-in is from 2:00 PM onwards.",
            },
          ],
        }}
      />
    );

    expect(html).toContain("Frequently Asked Questions");
    expect(html).toContain("What is check-in time?");
    expect(html).toContain("data-block-type=\"faq\"");
  });

  it("renders RichTextBlock with semantic HTML markup", () => {
    const html = renderToString(
      <RichTextBlock
        props={{
          contentHtml: "<h2>Historic Heritage</h2><p>Founded in 1924.</p>",
        }}
      />
    );

    expect(html).toContain("<h2>Historic Heritage</h2>");
    expect(html).toContain("<p>Founded in 1924.</p>");
    expect(html).toContain("data-block-type=\"rich-text\"");
  });

  it("renders NavbarBlock with brand text and links", () => {
    const html = renderToString(
      <NavbarBlock
        props={{
          logoText: "Alpine Lodge",
          items: [
            { id: "n1", label: "About", target: { url: "/about" } },
            { id: "n2", label: "Rooms", target: { url: "/rooms" } },
          ],
          ctaButton: { label: "Book", target: { url: "/book" } },
        }}
      />
    );

    expect(html).toContain("Alpine Lodge");
    expect(html).toContain("About");
    expect(html).toContain("Rooms");
    expect(html).toContain("Book");
    expect(html).toContain("data-block-type=\"navbar\"");
  });

  it("renders FooterBlock with columns and copyright notice", () => {
    const html = renderToString(
      <FooterBlock
        props={{
          logoText: "Alpine Lodge",
          copyrightText: "© 2026 Alpine Lodge Inc.",
          columns: [
            {
              id: "c1",
              title: "Discover",
              links: [{ id: "l1", label: "Tours", target: { url: "/tours" } }],
            },
          ],
        }}
      />
    );

    expect(html).toContain("Alpine Lodge");
    expect(html).toContain("© 2026 Alpine Lodge Inc.");
    expect(html).toContain("Discover");
    expect(html).toContain("Tours");
    expect(html).toContain("data-block-type=\"footer\"");
  });
});
