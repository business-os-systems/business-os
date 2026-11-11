/**
 * Published abuse response path (FR-131, FR-137). Content lives in config so
 * the public page stays declarative and the same steps can be tested and
 * documented without duplicating copy in JSX.
 */
export interface AbuseResponseStep {
  readonly title: string;
  readonly description: string;
}

export interface AbuseScopeNotice {
  readonly title: string;
  readonly description: string;
}

export const ABUSE_RESPONSE_STEPS: readonly AbuseResponseStep[] = [
  {
    title: "Report",
    description:
      "Email the monitored abuse address with the hostname, the page address and what you observed. Do not include passwords, card details or one-time codes.",
  },
  {
    title: "Triage",
    description:
      "An operator reviews the report against the platform audit trail and the site's publishing history, then records the decision.",
  },
  {
    title: "Takedown or clear",
    description:
      "A published site can be suspended immediately with a recorded reason. Suspension stops public delivery at every host and is reversible by an operator.",
  },
  {
    title: "Evidence and restoration",
    description:
      "Content is retained as evidence before removal. A site cleared by review is restored to the status it held before suspension.",
  },
];

export const ABUSE_SCOPE_NOTICES: readonly AbuseScopeNotice[] = [
  {
    title: "Report-driven in release one",
    description:
      "Detection is report-driven with structural safeguards. The platform does not claim automatic detection of all abusive content.",
  },
  {
    title: "Structural safeguards",
    description:
      "Reserved host labels, host impersonation and excessive host claims are checked at publish and daily. Form ingestion also refuses password, card and one-time-code field names.",
  },
];
