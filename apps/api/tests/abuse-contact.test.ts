import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { abuseRouter } from "../src/routes/abuse.js";
import { abuseContactLinkMiddleware } from "../src/middleware/abuse-contact-link.js";

const CONTACT = "abuse-team@example.com";
const PAGE_URL = "https://platform.example/abuse";

afterEach(() => {
  delete process.env.ABUSE_CONTACT_EMAIL;
  delete process.env.ABUSE_PAGE_URL;
});

describe("Published abuse contact endpoint", () => {
  it("returns the configured contact and the documented response path", async () => {
    process.env.ABUSE_CONTACT_EMAIL = CONTACT;
    const response = await abuseRouter.request("/contact");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: { contactEmail: string; responsePath: string; reportDriven: boolean };
    };
    expect(body.data).toEqual({
      contactEmail: CONTACT,
      responsePath: "/abuse",
      reportDriven: true,
    });
  });

  it("fails closed instead of returning a placeholder address", async () => {
    const response = await abuseRouter.request("/contact");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("@example.com");
  });
});

describe("Storefront abuse Link header", () => {
  function app(): Hono {
    const instance = new Hono();
    instance.use("*", abuseContactLinkMiddleware());
    instance.get("*", (c) => c.json({ detail: "holding" }, 404));
    return instance;
  }

  it("links holding and GONE responses to the configured abuse page", async () => {
    process.env.ABUSE_PAGE_URL = PAGE_URL;
    const response = await app().request("/");
    expect(response.status).toBe(404);
    expect(response.headers.get("Link")).toBe(
      '<' + PAGE_URL + '>; rel="abuse-contact"'
    );
  });

  it("adds no link when the deployment has not configured a page", async () => {
    const response = await app().request("/");
    expect(response.headers.get("Link")).toBeNull();
  });

  it("refuses a page URL that embeds credentials", async () => {
    process.env.ABUSE_PAGE_URL = "https://user:secret@platform.example/abuse";
    const response = await app().request("/");
    expect(response.status).toBe(500);
  });
});
