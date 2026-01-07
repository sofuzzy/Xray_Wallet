import type { Response } from "express";

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * Send a consistent API error payload.
 * Never include secrets (tokens, keys, raw headers, full request bodies) in `details`.
 */
export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const payload: ApiErrorResponse = { error: { code, message } };
  if (details !== undefined) payload.error.details = details;
  return res.status(status).json(payload);
}
