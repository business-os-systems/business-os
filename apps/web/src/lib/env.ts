/**
 * Server configuration for the storefront application (P14).
 * The API base URL is declared in .env.example; a missing value fails loudly
 * instead of silently calling a developer machine.
 */

function requireDeclaredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(name + " environment variable must be pre-declared in .env");
  }
  return value;
}

export function getStorefrontApiUrl(): string {
  return requireDeclaredEnv("API_URL").replace(/\/$/, "");
}

export function getNodeEnv(): string {
  return requireDeclaredEnv("NODE_ENV");
}
