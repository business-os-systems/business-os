import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardContent, Badge, Checkbox } from "../src/index.js";
import { CheckIcon, ArrowRightIcon, SparklesIcon, ShieldCheckIcon } from "../src/icons/index.js";

describe("@suite/ui Component Library Primitives", () => {
  it("renders Button with default variant and accessible attributes", () => {
    const html = renderToString(<Button type="button">Click Me</Button>);
    expect(html).toContain("Click Me");
    expect(html).toContain("type=\"button\"");
    expect(html).toContain("bg-action");
  });

  it("renders Button with secondary and destructive variants", () => {
    const secondaryHtml = renderToString(<Button variant="secondary">Cancel</Button>);
    expect(secondaryHtml).toContain("bg-surface");
    expect(secondaryHtml).toContain("border-border-strong");

    const destructiveHtml = renderToString(<Button variant="destructive">Delete</Button>);
    expect(destructiveHtml).toContain("bg-danger");
  });

  it("renders Input with error styling", () => {
    const html = renderToString(<Input placeholder="Enter your email" hasError />);
    expect(html).toContain("border-danger");
    expect(html).toContain("placeholder=\"Enter your email\"");
  });

  it("renders Textarea with default attributes", () => {
    const html = renderToString(<Textarea rows={4} placeholder="Your message" />);
    expect(html).toContain("min-h-[88px]");
    expect(html).toContain("rows=\"4\"");
  });

  it("renders compound Card hierarchy correctly", () => {
    const html = renderToString(
      <Card>
        <CardHeader>
          <CardTitle>Mountain Villa</CardTitle>
        </CardHeader>
        <CardContent>Luxury accommodations</CardContent>
      </Card>
    );
    expect(html).toContain("Mountain Villa");
    expect(html).toContain("Luxury accommodations");
    expect(html).toContain("rounded-DEFAULT");
  });

  it("renders Badge variants correctly", () => {
    const successHtml = renderToString(<Badge variant="success">Active</Badge>);
    expect(successHtml).toContain("bg-action");
    expect(successHtml).toContain("Active");
  });

  it("renders Checkbox with accessible label association", () => {
    const html = renderToString(<Checkbox id="terms" label="I accept terms" />);
    expect(html).toContain("I accept terms");
    expect(html).toContain("id=\"terms\"");
  });

  it("renders decoupled icon facade components as valid SVGs", () => {
    const checkHtml = renderToString(<CheckIcon size={24} />);
    expect(checkHtml).toContain("<svg");
    expect(checkHtml).toContain("width=\"24\"");

    const sparkleHtml = renderToString(<SparklesIcon size={16} />);
    expect(sparkleHtml).toContain("width=\"16\"");

    const shieldHtml = renderToString(<ShieldCheckIcon />);
    expect(shieldHtml).toContain("<svg");

    const arrowHtml = renderToString(<ArrowRightIcon />);
    expect(arrowHtml).toContain("<svg");
  });
});
