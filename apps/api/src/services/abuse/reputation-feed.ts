import { readFile } from "node:fs/promises";
import { z } from "zod";
import { normalizeHost } from "./reputation-policy.js";

/**
 * A deployment-managed blocklist file. Using a local path avoids SSRF: the job
 * never fetches a URL a tenant or request could influence (ASVS V12).
 */
const feedSchema = z
  .object({
    updatedAt: z.string().datetime(),
    blockedHosts: z.array(z.string().trim().min(1).max(255)).max(10_000),
  })
  .strict();

export interface ReputationFeed {
  readonly updatedAt: string;
  readonly blockedHosts: ReadonlySet<string>;
}

export class ReputationFeedUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReputationFeedUnavailableError";
  }
}

export async function loadReputationFeed(
  path: string | null
): Promise<ReputationFeed | null> {
  if (path === null) {
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new ReputationFeedUnavailableError(
      "The configured reputation feed could not be read.",
      { cause: error }
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ReputationFeedUnavailableError(
      "The configured reputation feed is not valid JSON.",
      { cause: error }
    );
  }
  const result = feedSchema.safeParse(parsed);
  if (!result.success) {
    throw new ReputationFeedUnavailableError(
      "The configured reputation feed does not match its declared schema."
    );
  }
  return {
    updatedAt: result.data.updatedAt,
    blockedHosts: new Set(result.data.blockedHosts.map(normalizeHost)),
  };
}
