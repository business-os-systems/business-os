/**
 * Status/error mapper for the sign-in page query string. The page used a
 * six-branch if-cascade with a truthiness fallback for the organization label;
 * this module keeps the same messages behind a typed, exhaustive lookup (P3/P5).
 */

import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";

export interface AuthQuerySource {
  get(name: string): string | null;
}

export const LOGIN_ERROR_CODES = [
  "sso_not_found",
  "oauth_cancelled",
  "oauth_failed",
] as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

const ARCHIVED_NOTICE = "archived";
const SSO_UNCONFIGURED = "sso_unconfigured";
const UNKNOWN_ORGANIZATION = "your organization";

const NOTICE_MESSAGES: Readonly<Record<typeof ARCHIVED_NOTICE, string>> = {
  [ARCHIVED_NOTICE]:
    "This organization has been archived. Please sign in to an active organization.",
};

const ERROR_MESSAGES: Readonly<Record<LoginErrorCode, string>> = {
  sso_not_found:
    "Enterprise SSO connection not found. Please sign in with your email and password.",
  oauth_cancelled:
    "Sign-in was cancelled. You can sign in using your email and password or try another provider.",
  oauth_failed: "Authentication failed. Please check your credentials or try again.",
};

function isLoginErrorCode(value: string): value is LoginErrorCode {
  return LOGIN_ERROR_CODES.some((code) => code === value);
}

function mapSsoUnconfigured(source: AuthQuerySource): string {
  const organization =
    firstNonEmpty(source.get("org"), source.get("domain")) ??
    UNKNOWN_ORGANIZATION;
  return (
    "Enterprise SSO is not yet configured for " +
    organization +
    ". Please sign in with your email and password."
  );
}

/**
 * Resolves the banner message for the current query string, or null when the
 * page has no status to present.
 */
export function mapLoginNotice(source: AuthQuerySource): string | null {
  const notice = source.get("notice");
  if (notice === ARCHIVED_NOTICE) {
    return NOTICE_MESSAGES[ARCHIVED_NOTICE];
  }

  const error = source.get("error");
  if (error === null) {
    return null;
  }
  if (error === SSO_UNCONFIGURED) {
    return mapSsoUnconfigured(source);
  }
  if (isLoginErrorCode(error)) {
    return ERROR_MESSAGES[error];
  }
  return null;
}
