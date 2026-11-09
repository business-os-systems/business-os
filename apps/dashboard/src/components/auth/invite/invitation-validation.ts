/**
 * Client-side guard for the invitation acceptance form. The order and copy of
 * every message are preserved from the original page; the server remains the
 * authority on the real password policy (P3/P9).
 */

export interface InvitationCredentials {
  token: string;
  password: string;
  confirmPassword: string;
}

const TOKEN_REQUIRED_MESSAGE = "Missing invitation token.";
const PASSWORD_REQUIRED_MESSAGE = "Please enter a password.";
const PASSWORD_TOO_SHORT_MESSAGE = "Password must be at least 12 characters long.";
const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match.";

// Retained verbatim from the pre-refactor page: the hint promises 12 while the
// local check is 8. Changing it would alter accepted input, so it is carried
// forward as a documented follow-up instead (see STATUS-273-B).
const LOCAL_PASSWORD_MIN_LENGTH = 8;

export function validateInvitationCredentials(
  credentials: InvitationCredentials
): string | null {
  if (credentials.token.length === 0) {
    return TOKEN_REQUIRED_MESSAGE;
  }
  if (credentials.password.length === 0) {
    return PASSWORD_REQUIRED_MESSAGE;
  }
  if (credentials.password.length < LOCAL_PASSWORD_MIN_LENGTH) {
    return PASSWORD_TOO_SHORT_MESSAGE;
  }
  if (credentials.password !== credentials.confirmPassword) {
    return PASSWORD_MISMATCH_MESSAGE;
  }
  return null;
}
