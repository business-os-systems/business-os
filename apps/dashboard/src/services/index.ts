/**
 * Dashboard data boundary (P2 / P11).
 *
 * Next route handlers under `apps/dashboard/src/app/api/**` are the tenant data
 * boundary. They parse and validate input, resolve the authenticated session,
 * call a server-side service in `apps/dashboard/src/services/**`, then map the
 * result to an HTTP envelope. They never query Prisma or the cache directly.
 *
 * Server components call the same services; they never contain an inline Prisma
 * query beyond that single service call.
 *
 * Services own the database and cache access. They expose typed DTOs, scope
 * every query by organization, and never import HTTP, React or Next.js types.
 * This keeps the transport layer swappable and lets each service be characterised
 * without a request.
 */

export type { InstalledAppDto } from "./installed-apps.service";
export type { LoginSessionContext, PasswordLoginResult } from "./login.service";
export type { OrganizationDetailDto } from "./organization-settings.service";
