export interface SuccessResponsePayload<T> {
  readonly success: true;
  readonly data: T;
  readonly requestId: string;
  readonly timestamp: string;
}

export function createSuccessResponseBody<T>(input: {
  readonly data: T;
  readonly requestId: string;
}): SuccessResponsePayload<T> {
  return {
    success: true,
    data: input.data,
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
  };
}
