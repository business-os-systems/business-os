import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import AbuseContactPage from "../src/app/abuse/page";
import {
  ABUSE_RESPONSE_STEPS,
  ABUSE_SCOPE_NOTICES,
} from "../src/components/abuse/abuse-contact.config";

const CONTACT = "abuse-team@example.com";

afterEach(() => {
  delete process.env.ABUSE_CONTACT_EMAIL;
});

describe("Published abuse contact", () => {
  it("renders the monitored address from configuration, never a fallback", () => {
    process.env.ABUSE_CONTACT_EMAIL = CONTACT;
    const html = renderToString(<AbuseContactPage />);
    expect(html).toContain(CONTACT);
    expect(html).toContain('href="mailto:' + CONTACT + '"');
    for (const step of ABUSE_RESPONSE_STEPS) {
      expect(html).toContain(step.title);
    }
  });

  it("states that detection is report-driven with structural safeguards", () => {
    process.env.ABUSE_CONTACT_EMAIL = CONTACT;
    const html = renderToString(<AbuseContactPage />);
    for (const notice of ABUSE_SCOPE_NOTICES) {
      expect(html).toContain(notice.title);
    }
    expect(html).toContain("does not claim automatic detection");
  });

  it("fails closed instead of publishing a placeholder address", () => {
    expect(() => renderToString(<AbuseContactPage />)).toThrow(
      "ABUSE_CONTACT_EMAIL"
    );
  });
});
