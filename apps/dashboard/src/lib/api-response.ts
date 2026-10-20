import { NextResponse } from "next/server";
import {
  createProblemEnvelope,
  createSuccessEnvelope,
  type ProblemPayloadInput,
  type SuccessPayloadInput,
} from "@suite/core";

export interface SuccessResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Creates a standardized Next.js JSON response adhering strictly to RFC 7807 problem details.
 */
export function problemResponse(input: ProblemPayloadInput): NextResponse {
  const envelope = createProblemEnvelope(input);
  return NextResponse.json(envelope.body, envelope.init);
}

/**
 * Creates a standardized Next.js JSON success response.
 */
export function successResponse<T>(
  data: T,
  options?: SuccessResponseOptions
): NextResponse {
  const envelope = createSuccessEnvelope({
    data,
    status: options?.status,
    headers: options?.headers,
  });
  return NextResponse.json(envelope.body, envelope.init);
}

export type { ProblemPayloadInput, SuccessPayloadInput };
