/**
 * Reads a response body as JSON without throwing on malformed or empty
 * payloads, so every auth page maps a typed outcome instead of cascading
 * field fallbacks (P3/P10/P12).
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
