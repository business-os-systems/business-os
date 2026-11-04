const FALLBACK_MESSAGE = "An unexpected error occurred." as const;

/**
 * Turns a thrown value into text a screen may show. The previous inline
 * expression repeated in four files and rendered "[object Object]" for a
 * non-Error rejection.
 */
export function toMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== "") {
    return cause.message;
  }
  if (typeof cause === "string" && cause.trim() !== "") {
    return cause;
  }
  return FALLBACK_MESSAGE;
}
