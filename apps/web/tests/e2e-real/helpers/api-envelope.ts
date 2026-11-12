/**
 * Envelope and problem-detail readers for the journey's API calls (#379).
 *
 * Every response is checked against the declared success envelope instead of
 * being asserted into a shape, so a contract change fails the journey with the
 * server's own detail rather than a later, misleading assertion.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("The response has no string \"" + key + "\".");
  }
  return value;
}

export function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("The response has no integer \"" + key + "\".");
  }
  return value;
}

export function readEnvelopeData(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new Error("The response is not the declared success envelope.");
  }
  return body.data;
}

export async function readJson(response: { json: () => Promise<unknown> }): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function requireOk(
  response: { ok: () => boolean; status: () => number; text: () => Promise<string> },
  step: string
): Promise<void> {
  if (response.ok()) {
    return;
  }
  throw new Error(step + " failed with " + String(response.status()) + ": " + (await response.text()));
}
