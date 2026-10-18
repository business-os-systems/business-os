/**
 * Universal HTTP Service (@suite/dashboard)
 *
 * Provides standardized HTTP client methods (GET, POST, PATCH, PUT, DELETE) with
 * default headers (Content-Type: application/json, Accept: application/json),
 * query parameter serialization, custom header extensions, and type-safe response handling.
 */

export interface RequestOptions<TBody = unknown> {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: TBody;
  signal?: AbortSignal;
}

export interface HttpResponse<TData = unknown> {
  ok: boolean;
  status: number;
  data: TData;
  headers: Headers;
}

export class HttpError<TError = unknown> extends Error {
  readonly status: number;
  readonly data: TError;

  constructor(message: string, status: number, data: TError) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export class HttpClient {
  private readonly defaultHeaders: Record<string, string>;

  constructor(defaultHeaders: Record<string, string> = {}) {
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...defaultHeaders,
    };
  }

  private buildUrl(
    apiPath: string,
    params?: Record<string, string | number | boolean | undefined | null>
  ): string {
    if (!params) return apiPath;

    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }

    const queryString = searchParams.toString();
    if (!queryString) return apiPath;

    return apiPath.includes("?")
      ? `${apiPath}&${queryString}`
      : `${apiPath}?${queryString}`;
  }

  private async executeRequest<TResponse, TBody = unknown>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    apiPath: string,
    options: RequestOptions<TBody> = {}
  ): Promise<HttpResponse<TResponse>> {
    const url = this.buildUrl(apiPath, options.params);
    const headers = new Headers({
      ...this.defaultHeaders,
      ...options.headers,
    });

    const isJsonBody =
      options.body !== undefined &&
      (headers.get("Content-Type") || "").includes("application/json");

    const body =
      options.body !== undefined
        ? isJsonBody && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : (options.body as BodyInit)
        : undefined;

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: options.signal,
    });

    let data: TResponse;
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json") || contentType.includes("application/problem+json")) {
      data = (await response.json()) as TResponse;
    } else {
      data = (await response.text()) as unknown as TResponse;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      headers: response.headers,
    };
  }

  async get<TResponse>(
    apiPath: string,
    options?: Omit<RequestOptions, "body">
  ): Promise<HttpResponse<TResponse>> {
    return this.executeRequest<TResponse>("GET", apiPath, options);
  }

  async post<TResponse, TBody = unknown>(
    apiPath: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "body">
  ): Promise<HttpResponse<TResponse>> {
    return this.executeRequest<TResponse, TBody>("POST", apiPath, {
      ...options,
      body,
    });
  }

  async patch<TResponse, TBody = unknown>(
    apiPath: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "body">
  ): Promise<HttpResponse<TResponse>> {
    return this.executeRequest<TResponse, TBody>("PATCH", apiPath, {
      ...options,
      body,
    });
  }

  async put<TResponse, TBody = unknown>(
    apiPath: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "body">
  ): Promise<HttpResponse<TResponse>> {
    return this.executeRequest<TResponse, TBody>("PUT", apiPath, {
      ...options,
      body,
    });
  }

  async delete<TResponse>(
    apiPath: string,
    options?: Omit<RequestOptions, "body">
  ): Promise<HttpResponse<TResponse>> {
    return this.executeRequest<TResponse>("DELETE", apiPath, options);
  }
}

export const httpClient = new HttpClient();
