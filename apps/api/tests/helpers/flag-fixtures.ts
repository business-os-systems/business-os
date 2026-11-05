import { FLAG_ENVIRONMENTS } from "@suite/flags/contracts";

/**
 * Flag test data factory. Keys are namespaced and unique per suite; the body is
 * the one place the required lifecycle metadata is assembled (OP-12).
 */
export function buildFlagKey(input: {
  readonly suffix: string;
  readonly label: string;
  readonly index: number;
}): string {
  return `flag.${input.suffix}.${input.label}_${input.index}`;
}

export function buildFlagExpiry(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

export function buildFlagCreateBody(input: {
  readonly key: string;
  readonly name?: string;
  readonly environment?: string;
  readonly owner?: string;
  readonly expiresAt?: string;
  readonly removalTicket?: string;
  readonly description?: string;
}): Record<string, unknown> {
  const description = input.description;
  return {
    key: input.key,
    name: input.name ?? "Lifecycle test flag",
    environment: input.environment ?? FLAG_ENVIRONMENTS[0],
    owner: input.owner ?? "platform@example.com",
    expiresAt: input.expiresAt ?? buildFlagExpiry(),
    removalTicket: input.removalTicket ?? "#224",
    ...(description === undefined ? {} : { description }),
  };
}
