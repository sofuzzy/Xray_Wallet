import type { ZodIssue } from "zod";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

/**
 * A lightweight error type for consistent API responses.
 * Never include secrets (tokens, keys, raw headers) in `details`.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return typeof err === "object" && err !== null && "status" in err && "code" in err;
}

export function zodDetails(issues: ZodIssue[]) {
  return {
    issues: issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    })),
  };
}
