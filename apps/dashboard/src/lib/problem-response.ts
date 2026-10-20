import { NextResponse } from "next/server";
import { createProblemEnvelope, type ProblemPayloadInput } from "@suite/core";

/**
 * Creates a Next.js JSON response adhering strictly to RFC 7807 problem details.
 */
export function problemResponse(input: ProblemPayloadInput): NextResponse {
  const envelope = createProblemEnvelope(input);
  return NextResponse.json(envelope.body, envelope.init);
}
