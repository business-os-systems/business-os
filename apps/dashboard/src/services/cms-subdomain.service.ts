import { checkRateLimit } from "@suite/redis";
import { SiteService } from "@suite/website-builder/services";

const MAX_SUBDOMAIN_CHECKS_PER_MINUTE_IP = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export type SubdomainRateLimitResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfter: number };

export async function enforceSubdomainCheckRateLimit(
  clientIp: string | undefined
): Promise<SubdomainRateLimitResult> {
  if (!clientIp) {
    return { allowed: true };
  }
  const result = await checkRateLimit([
    {
      key: `ratelimit:check-subdomain:ip:${clientIp}`,
      max: MAX_SUBDOMAIN_CHECKS_PER_MINUTE_IP,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    },
  ]);
  if (result.allowed) {
    return { allowed: true };
  }
  return { allowed: false, retryAfter: result.retryAfter };
}

export function checkSubdomainAvailability(subdomain: string) {
  const service = new SiteService();
  return service.checkSubdomainAvailability(subdomain);
}
