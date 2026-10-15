export interface PasswordComplexityResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecialSymbol: boolean;
  score: number;
}

/**
 * Validates password complexity against SPEC-AUTH-001 Section 4.1.1:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 * - At least 1 special symbol
 *
 * Pure validation utility safe for execution across both client and server boundaries.
 */
export function validatePasswordComplexity(password: string): PasswordComplexityResult {
  const safePwd = typeof password === "string" ? password : "";
  const hasMinLength = safePwd.length >= 8;
  const hasUppercase = /[A-Z]/.test(safePwd);
  const hasNumber = /[0-9]/.test(safePwd);
  const hasSpecialSymbol = /[^A-Za-z0-9]/.test(safePwd);

  const checks = [hasMinLength, hasUppercase, hasNumber, hasSpecialSymbol];
  const score = checks.filter(Boolean).length;

  return {
    isValid: hasMinLength && hasUppercase && hasNumber && hasSpecialSymbol,
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSpecialSymbol,
    score,
  };
}
