import type { ApiError } from "@/lib/queryClient";

type ZodIssue = { path?: (string | number)[]; message?: string };

const CODE_FRIENDLY: Record<string, string> = {
  VALIDATION_ERROR: "Please check the highlighted fields and try again.",
  INVALID_AMOUNT: "Enter a valid amount and try again.",
  STRIPE_CONFIG_ERROR: "Payments aren’t configured correctly yet. Try again later.",
  STRIPE_PAYMENT_INTENT_ERROR: "Payment couldn’t be created. Please try again.",
  STRIPE_WEBHOOK_PROCESSING_ERROR: "Payment update couldn’t be processed. Try again later.",
  STRIPE_WEBHOOK_BODY_INVALID: "Payment webhook payload was invalid.",
  STRIPE_WEBHOOK_MISSING_SIGNATURE: "Missing payment webhook signature.",
  OBJECT_NOT_FOUND: "That file couldn’t be found.",
  OBJECT_SERVE_ERROR: "Couldn’t serve that file right now.",
  OBJECT_STORAGE_DOWNLOAD_ERROR: "Couldn’t download that file right now.",
  OBJECT_STORAGE_STREAM_ERROR: "Couldn’t stream that file right now.",
  UPLOAD_URL_ERROR: "Couldn’t generate an upload URL. Please try again.",
};

function describeIssues(issues: ZodIssue[]): string {
  const parts = issues
    .slice(0, 3)
    .map((i) => {
      const p = Array.isArray(i.path) && i.path.length ? i.path.join(".") : "";
      const msg = i.message || "Invalid input";
      return p ? `${p}: ${msg}` : msg;
    })
    .filter(Boolean);
  return parts.join(" • ");
}

export function formatApiError(err: unknown, fallback = "Request failed"): string {
  if (!err) return fallback;
  const anyErr = err as any;

  // Our ApiError class is thrown by queryClient.ts
  const apiErr = err as ApiError;
  const status = (apiErr as any)?.status as number | undefined;

  // RiskShield special cases (some endpoints may return legacy shapes)
  if (status === 428) {
    // Acknowledgement required
    return (
      apiErr?.data?.error?.message ||
      apiErr?.data?.message ||
      "This token looks risky. Review the warnings to continue."
    );
  }
  if (status === 403) {
    return (
      apiErr?.data?.error?.message ||
      apiErr?.data?.message ||
      "This action is blocked for your safety."
    );
  }

  // Prefer unified server shape: { error: { code, message, details } }
  const code = apiErr?.data?.error?.code;
  if (typeof code === "string" && CODE_FRIENDLY[code]) {
    return CODE_FRIENDLY[code];
  }

  const msg = typeof anyErr?.message === "string" ? anyErr.message : fallback;

  const issues: ZodIssue[] | undefined = apiErr?.data?.error?.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    return describeIssues(issues) || msg;
  }

  return msg;
}
