import type { CSSProperties } from "react";

export interface StorefrontStatePanelProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly message: string;
  readonly homeLabel: string;
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  margin: 0,
  display: "grid",
  placeItems: "center",
  padding: "2rem 1.25rem",
  background: "var(--bos-bg)",
  color: "var(--bos-text)",
  fontFamily: "var(--bos-font-sans)",
};

const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: "34rem",
  padding: "2rem",
  border: "1px solid var(--bos-border)",
  borderRadius: "0.5rem",
  background: "var(--bos-surface)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--bos-brand-text)",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "0.5rem 0 0",
  color: "var(--bos-text)",
  fontFamily: "var(--bos-font-heading)",
  fontSize: "1.75rem",
  lineHeight: 1.2,
};

const messageStyle: CSSProperties = {
  margin: "0.75rem 0 0",
  color: "var(--bos-text-secondary)",
  lineHeight: 1.6,
};

const linkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: "1.5rem",
  color: "var(--bos-action)",
  fontWeight: 600,
};

/**
 * The neutral, branded state used by the not-found and holding surfaces. It
 * renders no tenant name, identifier or workspace affordance, so one tenant's
 * identity can never leak into another host's error page (FR-039, FR-110).
 */
export function StorefrontStatePanel({
  eyebrow,
  title,
  message,
  homeLabel,
}: StorefrontStatePanelProps) {
  return (
    <main style={pageStyle}>
      <section aria-labelledby="storefront-state-title" style={panelStyle}>
        <p style={eyebrowStyle}>{eyebrow}</p>
        <h1 id="storefront-state-title" style={titleStyle}>
          {title}
        </h1>
        <p style={messageStyle}>{message}</p>
        <a className="bos-focusable" href="/" style={linkStyle}>
          {homeLabel}
        </a>
      </section>
    </main>
  );
}
