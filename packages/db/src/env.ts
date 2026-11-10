export function getTenantDatabaseUrl(): string {
  const url = process.env.TENANT_DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("TENANT_DATABASE_URL must be configured for tenant queries.");
  }
  return url;
}

export function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV === "development";
}
