/**
 * Credential payload shared by the sign-in form, its submit hook and the HTTP
 * service. Living in a pure module keeps the service independent of the
 * presentational form component (P2).
 */
export interface AuthCredentialsData {
  email: string;
  password: string;
  keepSignedIn?: boolean;
  turnstileToken?: string | null;
}
