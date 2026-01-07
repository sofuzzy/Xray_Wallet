import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError, zodDetails } from "../utils/apiError";

type Target = "body" | "query" | "params";

/**
 * Zod validation middleware.
 * - Parses and replaces req[target] with the validated output.
 * - Calls next(ApiError) on validation failures.
 */
export function validate(schema: ZodTypeAny, target: Target = "body"): RequestHandler {
  return (req, _res, next) => {
    const input = (req as any)[target];
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return next(
        new ApiError(400, "VALIDATION_ERROR", `Invalid request ${target}`, zodDetails(parsed.error.issues)),
      );
    }
    (req as any)[target] = parsed.data;
    return next();
  };
}
